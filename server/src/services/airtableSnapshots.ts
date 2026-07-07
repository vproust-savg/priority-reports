// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/airtableSnapshots.ts
// PURPOSE: Batched Airtable snapshot writes for extended BBD lots.
//          Searches 30 lots per OR() call, writes 10 records per
//          request (Airtable max), 250ms spacing (~4 req/s, under
//          Airtable's ~5 req/s limit). Fire-and-forget semantics.
// USED BY: routes/extend.ts
// EXPORTS: snapshotExtendedItemsBatch, snapshotExtendedItem, SnapshotItem
// ═══════════════════════════════════════════════════════════════

import { env } from '../config/environment';
import { AIRTABLE_URL, F, airtableHeaders } from './airtableShortDated';
import type { RowData } from './airtableShortDated';

export interface SnapshotItem {
  serialName: string;
  rowData: RowData | undefined;
  newExpiryDate: string;
  days: number;
}

const SEARCH_CHUNK_SIZE = 30;
const WRITE_BATCH_SIZE = 10;
const WRITE_SPACING_MS = 250;

interface ExistingRecord {
  id: string;
  daysExtended: number;
}

interface AirtableRecordPayload {
  id?: string;
  fields: Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// WHY: serialNames are validated upstream (/^[a-zA-Z0-9_\-. ]+$/) so quotes
// can't occur today — escape anyway as defense against charset widening.
function escapeFormulaValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

// WHY: Lots whose search chunk failed go into skipLots — writing without a
// successful existence check would create duplicate Airtable records.
async function findExistingRecords(
  lotNumbers: string[],
): Promise<{ existing: Map<string, ExistingRecord>; skipLots: Set<string> }> {
  const existing = new Map<string, ExistingRecord>();
  const skipLots = new Set<string>();

  for (let i = 0; i < lotNumbers.length; i += SEARCH_CHUNK_SIZE) {
    const chunk = lotNumbers.slice(i, i + SEARCH_CHUNK_SIZE);
    const terms = chunk.map((lot) => `{${F.lotNumber}}="${escapeFormulaValue(lot)}"`);
    const formula = encodeURIComponent(`OR(${terms.join(',')})`);
    // WHY: returnFieldsByFieldId=true so response keys match our F.* constants.
    const url = `${AIRTABLE_URL}?filterByFormula=${formula}&returnFieldsByFieldId=true`;

    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) {
      // WHY: Name the affected lots — operators need to know WHICH snapshots
      // were skipped to backfill them (same observability as the old per-lot path).
      console.warn(`[bbd-extended] Airtable batch search failed (${res.status}) — skipping snapshots for: ${chunk.join(', ')}`);
      chunk.forEach((lot) => skipLots.add(lot));
      continue;
    }

    const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }> };
    for (const rec of data.records) {
      const lot = rec.fields[F.lotNumber] as string | undefined;
      if (lot) {
        existing.set(lot, { id: rec.id, daysExtended: (rec.fields[F.daysExtended] as number) ?? 0 });
      }
    }
  }

  return { existing, skipLots };
}

// WHY: Airtable date fields accept YYYY-MM-DD only (no time component).
function dateOnly(iso: string): string {
  return iso.split('T')[0];
}

// WHY: Update must NOT overwrite originalExpiryDate; daysExtended accumulates.
function buildUpdateRecord(item: SnapshotItem, found: ExistingRecord, extensionDate: string): AirtableRecordPayload {
  return {
    id: found.id,
    fields: {
      [F.newExpiryDate]: dateOnly(item.newExpiryDate),
      [F.daysExtended]: found.daysExtended + item.days,
      [F.extensionDate]: extensionDate,
      ...(item.rowData ? {
        [F.balance]: item.rowData.balance,
        [F.value]: item.rowData.value,
        [F.purchasePrice]: item.rowData.purchasePrice,
      } : {}),
    },
  };
}

// WHY: originalExpiryDate is set only on first insert.
function buildCreateRecord(item: SnapshotItem, extensionDate: string): AirtableRecordPayload {
  return {
    fields: {
      [F.lotNumber]: item.serialName,
      [F.originalExpiryDate]: item.rowData?.expiryDate ? dateOnly(item.rowData.expiryDate) : '',
      [F.newExpiryDate]: dateOnly(item.newExpiryDate),
      [F.daysExtended]: item.days,
      [F.extensionDate]: extensionDate,
      ...(item.rowData ? {
        [F.partNumber]: item.rowData.partNumber,
        [F.partDescription]: item.rowData.partDescription,
        [F.balance]: item.rowData.balance,
        [F.unit]: item.rowData.unit,
        [F.value]: item.rowData.value,
        [F.purchasePrice]: item.rowData.purchasePrice,
        [F.vendor]: item.rowData.vendor,
        [F.perishable]: item.rowData.perishable,
        [F.brand]: item.rowData.brand,
        [F.family]: item.rowData.family,
      } : {}),
    },
  };
}

async function writeBatches(method: 'POST' | 'PATCH', records: AirtableRecordPayload[]): Promise<void> {
  for (let i = 0; i < records.length; i += WRITE_BATCH_SIZE) {
    if (i > 0) await sleep(WRITE_SPACING_MS);
    const batch = records.slice(i, i + WRITE_BATCH_SIZE);
    try {
      const res = await fetch(AIRTABLE_URL, {
        method,
        headers: airtableHeaders(),
        body: JSON.stringify({ records: batch, typecast: true }),
      });
      if (!res.ok) {
        console.warn(`[bbd-extended] Airtable ${method} batch failed: ${res.status}`);
      }
    } catch (err) {
      console.warn(`[bbd-extended] Airtable ${method} batch error:`, err);
    }
  }
}

export async function snapshotExtendedItemsBatch(items: SnapshotItem[]): Promise<void> {
  if (items.length === 0) return;
  if (!env.AIRTABLE_TOKEN) {
    console.warn(`[bbd-extended] AIRTABLE_TOKEN not set — skipping snapshots for ${items.length} lots`);
    return;
  }

  const { existing, skipLots } = await findExistingRecords(items.map((i) => i.serialName));
  const extensionDate = new Date().toISOString();

  const updates: AirtableRecordPayload[] = [];
  const creates: AirtableRecordPayload[] = [];
  for (const item of items) {
    if (skipLots.has(item.serialName)) continue;
    const found = existing.get(item.serialName);
    if (found) {
      updates.push(buildUpdateRecord(item, found, extensionDate));
    } else {
      creates.push(buildCreateRecord(item, extensionDate));
    }
  }

  await writeBatches('PATCH', updates);
  if (updates.length > 0 && creates.length > 0) await sleep(WRITE_SPACING_MS);
  await writeBatches('POST', creates);
}

// WHY: Single-lot path (ExtendExpiryModal) rides the batch code —
// exactly one Airtable write path to maintain.
export async function snapshotExtendedItem(
  lotNumber: string,
  rowData: RowData | undefined,
  newExpiryDate: string,
  days: number,
): Promise<void> {
  return snapshotExtendedItemsBatch([{ serialName: lotNumber, rowData, newExpiryDate, days }]);
}
