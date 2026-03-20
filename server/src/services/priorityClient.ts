// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityClient.ts
// PURPOSE: HTTP client for Priority ERP oData API. Handles auth,
//          required headers, and retry logic. Rate limiting and
//          error extraction live in priorityRateLimit.ts.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: queryPriority, ODataParams, PriorityResponse
// ═══════════════════════════════════════════════════════════════

import https from 'node:https';
import { getPriorityConfig } from '../config/priority';
import { rateLimitDelay } from './priorityRateLimit';

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

// WHY: Node's native fetch (undici) causes "socket terminated" errors with
// Priority's CloudFront-backed API. Node's https module uses HTTP/1.1 and
// handles the connection correctly.
interface HttpsResponse {
  status: number;
  body: string;
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

function httpsGet(url: string): Promise<HttpsResponse> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        // WHY: Without IEEE754Compatible, Priority returns incorrect numeric values
        'IEEE754Compatible': 'true',
        // WHY: Without this, Priority may silently truncate results below 1000
        'Prefer': 'odata.maxpagesize=1000',
        'Authorization': `Basic ${auth}`,
      },
      timeout: 30_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf-8') });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
  });
}

// WHY: Priority returns errors in two JSON formats. Without parsing these,
// logs only show "400 Bad Request" with no actionable detail.
function extractErrorMessage(body: string): string {
  try {
    const data = JSON.parse(body);

    // OData standard format: { error: { message: "..." } }
    if (data?.error?.message) {
      const msg = typeof data.error.message === 'string'
        ? data.error.message
        : data.error.message.value;
      if (msg) return msg;
    }

    // Priority interface format: { FORM: { InterfaceErrors: { text: "..." } } }
    if (data?.FORM?.InterfaceErrors?.text) {
      return data.FORM.InterfaceErrors.text;
    }

    return body.slice(0, 200);
  } catch {
    return body.slice(0, 200) || 'Unknown error';
  }
}

// WHY: 429 gets 3 retries with exponential backoff (spec requirement).
// 500+ gets 1 retry with flat delay (transient server errors).
async function fetchWithRetry(url: string, attempt = 0, maxRetries = 3): Promise<HttpsResponse> {
  await rateLimitDelay();

  const response = await httpsGet(url);

  if (response.status === 401) {
    throw new Error('Priority auth failed — check credentials');
  }

  if (response.status === 429 && attempt < maxRetries) {
    const errMsg = extractErrorMessage(response.body);
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    console.warn(`[priority] Rate limited (${errMsg}) — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, attempt + 1, maxRetries);
  }

  if (response.status >= 500 && attempt < 1) {
    const errMsg = extractErrorMessage(response.body);
    console.warn(`[priority] Server error ${response.status} (${errMsg}) — retrying once`);
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

  if (response.status < 200 || response.status >= 300) {
    const errMsg = extractErrorMessage(response.body);
    throw new Error(`Priority query failed: ${response.status} — ${errMsg}`);
  }

  const data = JSON.parse(response.body) as { value?: Record<string, unknown>[] };
  return { value: data.value ?? [] };
}
