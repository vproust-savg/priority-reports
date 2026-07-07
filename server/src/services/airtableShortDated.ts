// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/airtableShortDated.ts
// PURPOSE: Airtable CRUD for the Short-Dated Items base. Handles
//          reads, balance refresh from Priority, and batch balance
//          writes. Snapshot writes live in airtableSnapshots.ts.
// USED BY: routes/extend.ts, services/airtableSnapshots.ts
// EXPORTS: fetchExtendedItems, refreshBalancesFromPriority,
//          batchUpdateAirtableBalances, mergeBalances,
//          F, AIRTABLE_URL, airtableHeaders, RowData
// ═══════════════════════════════════════════════════════════════

import { env } from '../config/environment';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry } from './priorityHttp';

// --- Airtable Constants ---
// WHY: Field IDs are permanent. Field names can change.
const BASE_ID = 'appEIH4f5K3vrKBuy';
const TABLE_ID = 'tblR550VQRqNgNMNE';
export const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

export const F = {
  lotNumber: 'fldkTERhjx4Nq2Xdj',
  partNumber: 'fldoXQnAMpUjSu2Bx',
  partDescription: 'fldd0k61OHJWMGjzi',
  balance: 'fldVzVKOOabR0ggLw',
  unit: 'fldaHPFg3Kx50BM0h',
  value: 'fldn4AaeqjPJy9n97',
  purchasePrice: 'fldMzTMbgo4M5Bwtg',
  vendor: 'fldi6NqDttCM94WzZ',
  perishable: 'fldsVAgVQPbAqE6Ua',
  brand: 'fld5BAG6CMGvme9o5',
  family: 'fld4VW5P7L2LH1IFW',
  originalExpiryDate: 'fldyuY9YkSEbWTPtB',
  newExpiryDate: 'fldfUUJcWVuH8fU4B',
  daysExtended: 'fldPWiPg4gTuEpb7S',
  extensionDate: 'fldzmoSH9PPOFxibL',
};

// --- Types ---

export interface ExtendedItemRow {
  _recordId: string;
  serialName: string;
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  originalExpiryDate: string;
  newExpiryDate: string;
  daysExtended: number;
  extensionDate: string;
}

export interface RowData {
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  expiryDate: string;
}

interface BalanceUpdate {
  recordId: string;
  balance: number;
  value: number;
}

// --- Pure Functions ---

export function mergeBalances(
  rows: ExtendedItemRow[],
  priorityMap: Map<string, { balance: number; purchasePrice: number }>,
): { mergedRows: ExtendedItemRow[]; changedRecords: BalanceUpdate[] } {
  const changedRecords: BalanceUpdate[] = [];
  const mergedRows = rows.map((row) => {
    const priority = priorityMap.get(row.serialName);
    if (!priority) return row;

    const newBalance = priority.balance;
    const newValue = Math.round(newBalance * row.purchasePrice * 100) / 100;

    if (newBalance !== row.balance) {
      changedRecords.push({ recordId: row._recordId, balance: newBalance, value: newValue });
    }

    return { ...row, balance: newBalance, value: newValue };
  });

  return { mergedRows, changedRecords };
}

// --- Helpers ---

export function airtableHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// --- I/O Functions ---

export async function fetchExtendedItems(): Promise<ExtendedItemRow[]> {
  if (!env.AIRTABLE_TOKEN) {
    throw new Error('AIRTABLE_TOKEN not set — cannot fetch extended items');
  }

  const allRecords: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;

  // WHY: Airtable returns max 100 records per request. Must paginate
  // with offset cursor until no offset is returned.
  do {
    // WHY: returnFieldsByFieldId=true so response keys match our F.* constants.
    // Without it, Airtable returns field names ("Lot Number") not IDs ("fldXXX").
    const params = offset
      ? `returnFieldsByFieldId=true&offset=${offset}`
      : 'returnFieldsByFieldId=true';
    const url = `${AIRTABLE_URL}?${params}`;
    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`);
    const data = await res.json() as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);

  // WHY: Transform Airtable field IDs to report key names.
  const rows: ExtendedItemRow[] = allRecords.map((rec) => ({
    _recordId: rec.id,
    serialName: (rec.fields[F.lotNumber] as string) ?? '',
    partNumber: (rec.fields[F.partNumber] as string) ?? '',
    partDescription: (rec.fields[F.partDescription] as string) ?? '',
    balance: (rec.fields[F.balance] as number) ?? 0,
    unit: (rec.fields[F.unit] as string) ?? '',
    value: (rec.fields[F.value] as number) ?? 0,
    purchasePrice: (rec.fields[F.purchasePrice] as number) ?? 0,
    vendor: (rec.fields[F.vendor] as string) ?? '',
    // WHY: With returnFieldsByFieldId + typecast, singleSelect returns plain string.
    perishable: (rec.fields[F.perishable] as string) ?? '',
    brand: (rec.fields[F.brand] as string) ?? '',
    family: (rec.fields[F.family] as string) ?? '',
    originalExpiryDate: (rec.fields[F.originalExpiryDate] as string) ?? '',
    newExpiryDate: (rec.fields[F.newExpiryDate] as string) ?? '',
    daysExtended: (rec.fields[F.daysExtended] as number) ?? 0,
    extensionDate: (rec.fields[F.extensionDate] as string) ?? '',
  }));

  // WHY: Sort in code by Extension Date descending. Avoids depending
  // on field names in Airtable sort params.
  rows.sort((a, b) => new Date(b.extensionDate).getTime() - new Date(a.extensionDate).getTime());

  return rows;
}

const CHUNK_SIZE = 30;

export async function refreshBalancesFromPriority(
  lotNumbers: string[],
): Promise<Map<string, { balance: number; purchasePrice: number }>> {
  if (lotNumbers.length === 0) return new Map();

  const config = getPriorityConfig();
  const resultMap = new Map<string, { balance: number; purchasePrice: number }>();

  // WHY: Chunk to groups of 30 to stay within OData URL length limits.
  // Priority's CloudFront can be finicky with long URLs.
  for (let i = 0; i < lotNumbers.length; i += CHUNK_SIZE) {
    const chunk = lotNumbers.slice(i, i + CHUNK_SIZE);
    const filterParts = chunk.map((sn) => `SERIALNAME eq '${sn.replace(/'/g, "''")}'`);
    const filter = filterParts.join(' or ');
    const url = `${config.baseUrl}RAWSERIAL?$select=SERIALNAME,QUANT,Y_8737_0_ESH&$filter=${encodeURIComponent(filter)}&$top=1000`;

    const response = await fetchWithRetry(url);
    if (response.status < 200 || response.status >= 300) {
      console.warn(`[bbd-extended] Priority balance refresh failed: ${response.status}`);
      continue;
    }

    const parsed = JSON.parse(response.body);
    for (const row of (parsed.value ?? [])) {
      const sn = (row.SERIALNAME as string)?.trim();
      if (sn) {
        resultMap.set(sn, {
          balance: Number(row.QUANT ?? 0),
          purchasePrice: Number(row.Y_8737_0_ESH ?? 0),
        });
      }
    }
  }

  return resultMap;
}

const AIRTABLE_BATCH_SIZE = 10;

export async function batchUpdateAirtableBalances(
  updates: BalanceUpdate[],
): Promise<void> {
  if (updates.length === 0 || !env.AIRTABLE_TOKEN) return;

  for (let i = 0; i < updates.length; i += AIRTABLE_BATCH_SIZE) {
    const batch = updates.slice(i, i + AIRTABLE_BATCH_SIZE);
    const body = {
      records: batch.map((u) => ({
        id: u.recordId,
        fields: {
          [F.balance]: u.balance,
          [F.value]: u.value,
        },
      })),
      typecast: true,
    };

    try {
      const res = await fetch(AIRTABLE_URL, {
        method: 'PATCH',
        headers: airtableHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[bbd-extended] Airtable balance batch update failed: ${res.status}`);
      }
    } catch (err) {
      console.warn('[bbd-extended] Airtable balance batch update error:', err);
    }
  }
}
