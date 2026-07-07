// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/extend.ts
// PURPOSE: POST /bbd/extend (Priority expiry extension) and
//          GET /bbd/extended (Airtable extended items tab).
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExtendRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry, postWithRetry, extractErrorMessage } from '../services/priorityHttp';
import type { ColumnDefinition } from '../../../shared/types/api';
import type { CacheProvider } from '../services/cache';
import { snapshotExtendedItemsBatch } from '../services/airtableSnapshots';
import type { SnapshotItem } from '../services/airtableSnapshots';
import {
  fetchExtendedItems,
  refreshBalancesFromPriority,
  mergeBalances,
  batchUpdateAirtableBalances,
} from '../services/airtableShortDated';

// WHY: rowData mirrors report rows, where Priority-sourced fields can be
// null (SUPDES → vendor is null on most live lots, verified 2026-07-07)
// and NaN numbers arrive as null after JSON serialization. It is a display
// snapshot for Airtable, not a business invariant — normalize, don't 400.
const nullableString = z.string().nullish().transform((v) => v ?? '');
const nullableNumber = z.number().nullish().transform((v) => v ?? 0);

const RowDataSchema = z.object({
  partNumber: nullableString,
  partDescription: nullableString,
  balance: nullableNumber,
  unit: nullableString,
  value: nullableNumber,
  purchasePrice: nullableNumber,
  vendor: nullableString,
  perishable: nullableString,
  brand: nullableString,
  family: nullableString,
  expiryDate: nullableString,
}).optional();

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    // WHY: Charset allowlist is the OData injection guard. '.' added because
    // real lot numbers contain it (e.g. 2518-41.24, 3 live lots 2026-07-07);
    // it is inert inside a quoted literal. Single quotes are escaped at use.
    serialName: z.string().regex(/^[a-zA-Z0-9_\-. ]+$/),
    days: z.number().int().min(1).max(365),
    rowData: RowDataSchema,
  })).min(1).max(100),
});

interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

// WHY: Adds N days to an ISO date string and returns Priority format.
function addDaysToDate(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('.')[0] + 'Z';
}

const LOOKUP_CHUNK_SIZE = 30;

interface LookupEntry {
  expiry?: string;
  error?: string;
}

// WHY: One OR-filter GET per 30 serials instead of one GET per lot — GETs are
// free against Priority's 10K/month write quota, and this cuts calls from 2N
// to N + ceil(N/30) against the org-shared 100-calls/min budget. Same chunk
// size as refreshBalancesFromPriority (keeps URLs under CloudFront limits).
async function batchLookupExpiryDates(
  serialNames: string[], baseUrl: string,
): Promise<Map<string, LookupEntry>> {
  const map = new Map<string, LookupEntry>();
  for (let i = 0; i < serialNames.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = serialNames.slice(i, i + LOOKUP_CHUNK_SIZE);
    const filter = chunk.map((sn) => `SERIALNAME eq '${sn.replace(/'/g, "''")}'`).join(' or ');
    const url = `${baseUrl}EXPDSERIAL?$select=SERIALNAME,EXPIRYDATE&$filter=${encodeURIComponent(filter)}&$top=1000`;

    const response = await fetchWithRetry(url);
    if (response.status < 200 || response.status >= 300) {
      // WHY: A failed chunk must NOT read as "lot not found" — mark its serials
      // as lookup errors so the user sees a retryable failure, not a wrong 404.
      const msg = extractErrorMessage(response.body);
      chunk.forEach((sn) => map.set(sn.trim(), { error: msg }));
      continue;
    }

    const parsed = JSON.parse(response.body);
    for (const rec of (parsed.value ?? []) as Array<Record<string, unknown>>) {
      // WHY: trim — EXPDSERIAL serials can carry whitespace (see buildExtensionMap).
      const sn = (rec.SERIALNAME as string | undefined)?.trim();
      if (sn) map.set(sn, { expiry: rec.EXPIRYDATE as string | undefined });
    }
  }
  return map;
}

async function processExtendItem(
  serialName: string, days: number, baseUrl: string,
  lookup: Map<string, LookupEntry>,
): Promise<ExtendResult> {
  const entry = lookup.get(serialName.trim());

  // WHY: The batched $filter lookup returns no row for unknown serials
  // (unlike the old single-entity GET which returned 404).
  if (!entry) {
    return { serialName, success: false, error: 'Lot not found in expiration tracking system' };
  }

  if (entry.error) {
    return { serialName, success: false, error: `Lookup failed: ${entry.error}` };
  }

  const currentExpiryDate = entry.expiry;
  if (!currentExpiryDate) {
    return { serialName, success: false, error: 'No expiry date found on EXPDSERIAL record' };
  }

  const newExpiryDate = addDaysToDate(currentExpiryDate, days);

  // WHY: Direct PATCH on EXPDSERIAL fails with "insufficient form privileges".
  // Priority requires navigating to the subform collection and POSTing there.
  const escapedName = serialName.replace(/'/g, "''");
  const postUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')/EXPDEXT_SUBFORM`;
  const postBody = {
    RENEWDATE: currentExpiryDate,
    EXPIRYDATE: newExpiryDate,
  };

  const postResponse = await postWithRetry(postUrl, postBody);

  if (postResponse.status < 200 || postResponse.status >= 300) {
    const msg = extractErrorMessage(postResponse.body);
    return { serialName, success: false, error: `Extension failed: ${msg}` };
  }

  return { serialName, success: true, newExpiryDate };
}

const EXTENDED_COLUMNS: ColumnDefinition[] = [
  { key: 'serialName', label: 'Lot Number', type: 'string' },
  { key: 'partNumber', label: 'Part Number', type: 'string' },
  { key: 'partDescription', label: 'Part Description', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'perishable', label: 'Perishable', type: 'string' },
  { key: 'brand', label: 'Brand', type: 'string' },
  { key: 'family', label: 'Family', type: 'string' },
  { key: 'originalExpiryDate', label: 'Orig. Expiry', type: 'date' },
  { key: 'newExpiryDate', label: 'New Expiry', type: 'date' },
  { key: 'daysExtended', label: 'Days Ext.', type: 'number' },
  { key: 'extensionDate', label: 'Extended On', type: 'date' },
];

export function createExtendRouter(cache: CacheProvider): Router {
  const router = Router();

  router.post('/bbd/extend', async (req, res) => {
    const parsed = ExtendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { items } = parsed.data;
    const config = getPriorityConfig();

    const uniqueSerials = Array.from(new Set(items.map((i) => i.serialName.trim())));
    const lookup = await batchLookupExpiryDates(uniqueSerials, config.baseUrl);

    const results: ExtendResult[] = [];
    for (const item of items) {
      const result = await processExtendItem(item.serialName, item.days, config.baseUrl, lookup);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[bbd-extend] Extended ${successCount}/${results.length} lots`);

    // WHY: Fire-and-forget — snapshot to Airtable after successful Priority extend.
    // Do not await — Airtable failure must not block the response.
    const snapshots: SnapshotItem[] = results
      .map((result, i) => ({ result, item: items[i] }))
      .filter(({ result, item }) => result.success && result.newExpiryDate && item.rowData)
      .map(({ result, item }) => ({
        serialName: result.serialName,
        rowData: item.rowData,
        newExpiryDate: result.newExpiryDate!,
        days: item.days,
      }));
    if (snapshots.length > 0) {
      snapshotExtendedItemsBatch(snapshots).catch((err) =>
        console.warn('[bbd-extend] Airtable snapshot batch failed:', err));
    }

    // WHY: Redis holds pre-extension report rows for up to 15 min — bust the
    // prefix (same op as POST /:reportId/refresh) so refetches are live.
    if (successCount > 0) {
      cache.invalidateByPrefix('query:bbd:').catch((err) =>
        console.warn('[bbd-extend] Cache invalidation failed:', err));
    }

    res.json({ results });
  });

  router.get('/bbd/extended', async (_req, res) => {
    try {
      const airtableRows = await fetchExtendedItems();

      if (airtableRows.length === 0) {
        res.json({
          columns: EXTENDED_COLUMNS,
          data: [],
          pagination: { totalCount: 0, totalPages: 1, page: 1, pageSize: 0 },
          meta: { source: 'airtable', generatedAt: new Date().toISOString() },
        });
        return;
      }

      const lotNumbers = airtableRows.map((r) => r.serialName);
      let priorityMap = new Map<string, { balance: number; purchasePrice: number }>();
      const warnings: string[] = [];

      try {
        priorityMap = await refreshBalancesFromPriority(lotNumbers);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        warnings.push(`Balance refresh failed: ${msg}`);
      }

      const { mergedRows, changedRecords } = mergeBalances(airtableRows, priorityMap);

      // WHY: Fire-and-forget — update Airtable balances in background.
      if (changedRecords.length > 0) {
        batchUpdateAirtableBalances(changedRecords).catch((err) =>
          console.warn('[bbd-extended] Background balance update failed:', err),
        );
      }

      // WHY: Strip _recordId from response — internal Airtable field, not for the client.
      const data = mergedRows.map(({ _recordId, ...rest }) => rest);

      res.json({
        columns: EXTENDED_COLUMNS,
        data,
        pagination: { totalCount: data.length, totalPages: 1, page: 1, pageSize: data.length },
        meta: { source: 'airtable', generatedAt: new Date().toISOString() },
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[bbd-extended] GET /bbd/extended failed:', msg);
      res.status(502).json({ error: `Failed to load extended items: ${msg}` });
    }
  });

  return router;
}
