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
  if (params.$top !== undefined) url.searchParams.set('$top', String(params.$top));
  if (params.$skip !== undefined) url.searchParams.set('$skip', String(params.$skip));
  if (params.$orderby) url.searchParams.set('$orderby', params.$orderby);

  let urlStr = url.toString();
  // WHY: $expand uses nested OData syntax like SUBFORM($select=TEXT).
  // URL.searchParams.set() form-encodes parentheses and $ to %28/%24/%3D/%29.
  // Priority's OData parser needs these unencoded. Append manually since
  // ( ) $ = are valid query-string characters per RFC 3986.
  if (params.$expand) {
    const separator = urlStr.includes('?') ? '&' : '?';
    urlStr += `${separator}$expand=${params.$expand}`;
  }

  return urlStr;
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

// WHY: Some entities don't support $expand (no sub-form).
// For those, use two-step: fetch parent, then fetch sub-form individually.
export async function querySubform(
  entity: string,
  keyParts: Record<string, string>,
  subformName: string,
  options: { select?: string } = {},
): Promise<Record<string, unknown> | null> {
  const config = getPriorityConfig();
  const keyStr = Object.entries(keyParts)
    // WHY: OData single-quote escaping doubles the quote (same pattern as escapeODataString)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "''")}'`)
    .join(',');
  let url = `${config.baseUrl}${entity}(${keyStr})/${subformName}`;
  // WHY: Some sub-forms (EXTFILES_SUBFORM on DOCUMENTS_N) return heavy
  // base64 binaries by default. The $select limits the payload to metadata
  // when callers only need filenames + keys.
  if (options.select) {
    url += `?$select=${options.select}`;
  }

  const response = await fetchWithRetry(url);

  if (response.status === 404) return null;
  if (response.status < 200 || response.status >= 300) {
    console.warn(`[priority] Sub-form fetch failed: ${response.status} for ${entity}/${subformName}`);
    return null;
  }

  try {
    const data = JSON.parse(response.body) as Record<string, unknown>;
    // WHY: Two response shapes from Priority — preserve both, callers decide.
    // - Single-entity sub-forms (e.g. DOCUMENTSTEXT_SUBFORM on DOCUMENTS_P/N)
    //   return fields directly: { @odata.context, TEXT, APPEND, ... }.
    // - Multi-record collection sub-forms (e.g. EXTFILES_SUBFORM on DOCUMENTS_N)
    //   return { @odata.context, value: [...] }.
    // We pass the collection shape through unchanged so callers can iterate
    // value[]. Previously this branch returned only value[0], silently
    // discarding additional records — the bug surfaced on Customer Returns'
    // EXTFILES_SUBFORM where rows commonly have 2+ attachments.
    if ('value' in data && Array.isArray(data.value)) {
      return { value: data.value };
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
