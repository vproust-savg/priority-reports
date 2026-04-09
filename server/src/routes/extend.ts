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
import {
  snapshotExtendedItem,
  fetchExtendedItems,
  refreshBalancesFromPriority,
  mergeBalances,
  batchUpdateAirtableBalances,
} from '../services/airtableShortDated';

const RowDataSchema = z.object({
  partNumber: z.string(),
  partDescription: z.string(),
  balance: z.number(),
  unit: z.string(),
  value: z.number(),
  purchasePrice: z.number(),
  vendor: z.string(),
  perishable: z.string(),
  brand: z.string(),
  family: z.string(),
  expiryDate: z.string(),
}).optional();

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),
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

async function processExtendItem(
  serialName: string, days: number, baseUrl: string,
): Promise<ExtendResult> {
  // Step 1: Look up current expiry date from EXPDSERIAL
  const escapedName = serialName.replace(/'/g, "''");
  const lookupUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')?$select=SERIALNAME,EXPIRYDATE`;

  const lookupResponse = await fetchWithRetry(lookupUrl);

  if (lookupResponse.status === 404) {
    return { serialName, success: false, error: 'Lot not found in expiration tracking system' };
  }

  if (lookupResponse.status < 200 || lookupResponse.status >= 300) {
    const msg = extractErrorMessage(lookupResponse.body);
    return { serialName, success: false, error: `Lookup failed: ${msg}` };
  }

  const lookupData = JSON.parse(lookupResponse.body);
  const currentExpiryDate = lookupData.EXPIRYDATE as string;

  if (!currentExpiryDate) {
    return { serialName, success: false, error: 'No expiry date found on EXPDSERIAL record' };
  }

  // Step 2: Calculate new expiry date
  const newExpiryDate = addDaysToDate(currentExpiryDate, days);

  // Step 3: POST new extension record via subform navigation
  // WHY: Direct PATCH on EXPDSERIAL fails with "insufficient form privileges".
  // Priority requires navigating to the subform collection and POSTing there.
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
  { key: 'balance', label: 'Balance', type: 'number' },
  { key: 'unit', label: 'Unit', type: 'string' },
  { key: 'value', label: 'Value', type: 'currency' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'perishable', label: 'Perishable', type: 'string' },
  { key: 'brand', label: 'Brand', type: 'string' },
  { key: 'family', label: 'Family', type: 'string' },
  { key: 'originalExpiryDate', label: 'Orig. Expiry', type: 'date' },
  { key: 'newExpiryDate', label: 'New Expiry', type: 'date' },
  { key: 'daysExtended', label: 'Days Ext.', type: 'number' },
  { key: 'extensionDate', label: 'Extended On', type: 'date' },
];

export function createExtendRouter(): Router {
  const router = Router();

  router.post('/bbd/extend', async (req, res) => {
    const parsed = ExtendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { items } = parsed.data;
    const config = getPriorityConfig();

    const results: ExtendResult[] = [];
    for (const item of items) {
      const result = await processExtendItem(item.serialName, item.days, config.baseUrl);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`[bbd-extend] Extended ${successCount}/${results.length} lots`);

    // WHY: Fire-and-forget — snapshot to Airtable after successful Priority extend.
    // Do not await — Airtable failure must not block the response.
    for (const [i, result] of results.entries()) {
      if (result.success && result.newExpiryDate && items[i].rowData) {
        snapshotExtendedItem(
          result.serialName, items[i].rowData!, result.newExpiryDate, items[i].days,
        ).catch((err) => console.warn(`[bbd-extend] Airtable snapshot failed for ${result.serialName}:`, err));
      }
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
