// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityClient.ts
// PURPOSE: HTTP client for Priority ERP oData API. Handles auth,
//          required headers, rate limiting, and error handling.
//          All Priority requests go through this client.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: queryPriority, ODataParams, PriorityResponse
// ═══════════════════════════════════════════════════════════════

import { getPriorityConfig } from '../config/priority';

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

// WHY: 200ms delay between requests to stay under Priority's 100 calls/minute limit
const RATE_LIMIT_DELAY_MS = 200;
let lastRequestTime = 0;

async function rateLimitDelay(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
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

function getHeaders(): Record<string, string> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return {
    'Content-Type': 'application/json',
    // WHY: Without IEEE754Compatible, Priority returns incorrect numeric values
    'IEEE754Compatible': 'true',
    // WHY: Without this, Priority may silently truncate results below 1000
    'Prefer': 'odata.maxpagesize=1000',
    'Authorization': `Basic ${auth}`,
  };
}

// WHY: 429 gets 3 retries with exponential backoff (spec requirement).
// 500+ gets 1 retry with flat delay (transient server errors).
async function fetchWithRetry(url: string, attempt = 0, maxRetries = 3): Promise<Response> {
  await rateLimitDelay();

  const response = await fetch(url, { headers: getHeaders() });

  if (response.status === 401) {
    throw new Error('Priority auth failed — check credentials');
  }

  if (response.status === 429 && attempt < maxRetries) {
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    console.warn(`[priority] Rate limited — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, attempt + 1, maxRetries);
  }

  if (response.status >= 500 && attempt < 1) {
    console.warn(`[priority] Server error ${response.status} — retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchWithRetry(url, attempt + 1, 1);
  }

  return response;
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

  if (!response.ok) {
    throw new Error(`Priority query failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { value?: Record<string, unknown>[] };
  return { value: data.value ?? [] };
}
