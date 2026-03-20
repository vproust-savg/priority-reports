// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityClient.ts
// PURPOSE: High-level Priority ERP oData client. Builds URLs,
//          parses responses, and provides queryPriority (list queries)
//          and querySubform (single sub-form fetch) APIs.
// USED BY: routes/reports.ts, routes/filters.ts, reports/grvLog.ts
// EXPORTS: queryPriority, querySubform, ODataParams, PriorityResponse
// ═══════════════════════════════════════════════════════════════

import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry, extractErrorMessage } from './priorityHttp';

export interface ODataParams {
  $select?: string;
  $filter?: string;
  $expand?: string;
  $top?: number;
  $skip?: number;
  $orderby?: string;
}

export interface PriorityResponse {
  value: Record<string, unknown>[];
}

function buildUrl(entity: string, params: ODataParams): string {
  const config = getPriorityConfig();
  const url = new URL(`${config.baseUrl}${entity}`);

  if (params.$select) url.searchParams.set('$select', params.$select);
  if (params.$filter) url.searchParams.set('$filter', params.$filter);
  if (params.$expand) url.searchParams.set('$expand', params.$expand);
  if (params.$top !== undefined) url.searchParams.set('$top', String(params.$top));
  if (params.$skip !== undefined) url.searchParams.set('$skip', String(params.$skip));
  if (params.$orderby) url.searchParams.set('$orderby', params.$orderby);

  return url.toString();
}

export async function queryPriority(
  entity: string,
  params: ODataParams = {},
): Promise<PriorityResponse> {
  const url = buildUrl(entity, params);
  const response = await fetchWithRetry(url);

  // WHY: 404 on a query means no results, not an error
  if (response.status === 404) {
    return { value: [] };
  }

  if (response.status < 200 || response.status >= 300) {
    const errMsg = extractErrorMessage(response.body);
    throw new Error(`Priority query failed: ${response.status} — ${errMsg}`);
  }

  let data: { value?: Record<string, unknown>[] };
  try {
    data = JSON.parse(response.body) as { value?: Record<string, unknown>[] };
  } catch {
    throw new Error(`Priority returned invalid JSON (${response.body.length} bytes): ${response.body.slice(0, 200)}`);
  }
  return { value: data.value ?? [] };
}

// WHY: Priority's $expand truncates responses on some entities. The proven
// pattern (from the sync project) is two-step: fetch parent, then fetch
// each sub-form individually via entity(key)/SUBFORM_NAME.
export async function querySubform(
  entity: string,
  keyParts: Record<string, string>,
  subformName: string,
): Promise<Record<string, unknown> | null> {
  const config = getPriorityConfig();
  const keyStr = Object.entries(keyParts)
    // WHY: OData single-quote escaping doubles the quote (same pattern as escapeODataString)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "''")}'`)
    .join(',');
  const url = `${config.baseUrl}${entity}(${keyStr})/${subformName}`;

  const response = await fetchWithRetry(url);

  if (response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) {
    console.warn(`[priority] Sub-form fetch failed: ${response.status} for ${entity}/${subformName}`);
    return null;
  }

  try {
    const data = JSON.parse(response.body) as Record<string, unknown>;
    // WHY: Single-entity sub-forms return fields directly (no "value" array).
    // Multi-record sub-forms return { value: [...] }. Handle both.
    if ('value' in data && Array.isArray(data.value)) {
      return (data.value as Record<string, unknown>[])[0] ?? null;
    }
    // Strip OData metadata keys, return data fields only
    const record: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith('@')) record[k] = v;
    }
    return Object.keys(record).length > 0 ? record : null;
  } catch {
    return null;
  }
}
