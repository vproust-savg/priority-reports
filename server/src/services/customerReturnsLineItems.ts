// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/customerReturnsLineItems.ts
// PURPOSE: Line-item helpers for the Customer Returns report. Explodes
//          each DOCUMENTS_N return into one row per TRANSORDER_N_SUBFORM
//          line item, and maps a line item to the 7 display fields.
// USED BY: reports/customerReturns.ts (explodeRows + transformRow + fetchFilters)
// EXPORTS: explodeReturnRows, lineItemFields, formatQuantityUnit,
//          collectReturnFilterOptions
// ═══════════════════════════════════════════════════════════════

import type { FilterOption } from '@shared/types';

// WHY: Private marker key carrying the single line item onto each exploded
// row. Kept in this module so explode + map agree on the key.
const LINE_KEY = '__LINE';

// WHY: Quantity and unit collapse into one display string ("1 cs"). TQUANT
// can be 0 (a real value, not "missing"), so only null/undefined/'' blanks it.
export function formatQuantityUnit(quant: unknown, unit: unknown): string | null {
  if (quant === null || quant === undefined || quant === '') return null;
  const suffix = typeof unit === 'string' && unit.length > 0 ? ` ${unit}` : '';
  return `${quant}${suffix}`;
}

// WHY: One parent return → N rows (one per returned SKU). A return with no
// line items still yields a single row (with __LINE: null) so it stays visible
// with blank line-item cells. Document fields are copied onto every row.
export function explodeReturnRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const items = row.TRANSORDER_N_SUBFORM;
    const list = Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
    if (list.length === 0) {
      out.push({ ...row, [LINE_KEY]: null });
    } else {
      for (const line of list) out.push({ ...row, [LINE_KEY]: line });
    }
  }
  return out;
}

// WHY: Builds the Return Code / Return Reason enum dropdown options from the
// expanded line items across parent rows. Option `value` equals the row's stored
// value so the client `equals` filter matches (code→returnCode, des→returnReason).
export function collectReturnFilterOptions(
  rows: Record<string, unknown>[],
): { returnCodes: FilterOption[]; returnReasons: FilterOption[] } {
  const seenCode = new Set<string>();
  const returnCodes: FilterOption[] = [];
  const seenReason = new Set<string>();
  const returnReasons: FilterOption[] = [];

  for (const row of rows) {
    const lines = Array.isArray(row.TRANSORDER_N_SUBFORM)
      ? (row.TRANSORDER_N_SUBFORM as Array<Record<string, unknown>>)
      : [];
    for (const line of lines) {
      const rc = line.RETREASONCODE as string | null | undefined;
      const rd = line.RETREASONDES as string | null | undefined;
      if (rc && !seenCode.has(rc)) {
        seenCode.add(rc);
        returnCodes.push({ value: rc, label: rd ? `${rc} — ${rd}` : rc });
      }
      if (rd && !seenReason.has(rd)) {
        seenReason.add(rd);
        returnReasons.push({ value: rd, label: rd });
      }
    }
  }

  return { returnCodes, returnReasons };
}

// WHY: Reads the exploded row's single line item and maps it to the report's
// line-item display fields. Null-safe for the no-line-item case.
export function lineItemFields(raw: Record<string, unknown>): Record<string, unknown> {
  const line = (raw[LINE_KEY] as Record<string, unknown> | null) ?? null;
  return {
    sku: line?.PARTNAME ?? null,
    itemName: line?.PDES ?? null,
    quantity: line ? formatQuantityUnit(line.TQUANT, line.TUNITNAME) : null,
    returnCode: line?.RETREASONCODE ?? null,
    returnReason: line?.RETREASONDES ?? null,
    lotNumber: line?.TOSERIALNAME ?? null,
    expDate: line?.Y_2301_0_ESH ?? null,
  };
}
