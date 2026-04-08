// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityHttp.ts
// PURPOSE: Low-level HTTPS transport for Priority API. Uses Node's
//          https module (not undici fetch) because Priority's CloudFront
//          terminates undici connections mid-response on some queries.
// USED BY: services/priorityClient.ts
// EXPORTS: fetchWithRetry, patchWithRetry, extractErrorMessage, HttpsResponse
// ═══════════════════════════════════════════════════════════════

import https from 'node:https';
import { getPriorityConfig } from '../config/priority';
import { rateLimitDelay } from './priorityRateLimit';

export interface HttpsResponse {
  status: number;
  body: string;
}

function httpsGet(url: string): Promise<HttpsResponse> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        // WHY: Without IEEE754Compatible, Priority returns incorrect numeric values
        'IEEE754Compatible': 'true',
        // WHY: Ceiling for Priority API response size. Actual page size
        // controlled by each report's $top parameter. Set to 49,900
        // (safety margin below MAXAPILINES=50,000).
        'Prefer': 'odata.maxpagesize=49900',
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

// WHY: Extend endpoint needs PATCH support. Uses https.request (not https.get)
// to send a JSON body with PATCH method. Same auth + headers as httpsGet.
function httpsRequest(url: string, method: string, body: unknown): Promise<HttpsResponse> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const jsonBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'IEEE754Compatible': 'true',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(jsonBody),
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
    req.write(jsonBody);
    req.end();
  });
}

// WHY: Priority returns errors in two JSON formats. Without parsing these,
// logs only show "400 Bad Request" with no actionable detail.
export function extractErrorMessage(body: string): string {
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
export async function fetchWithRetry(url: string, attempt = 0, maxRetries = 3): Promise<HttpsResponse> {
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

// WHY: Same retry logic as fetchWithRetry but for PATCH requests.
// Used by the extend endpoint to write to Priority.
export async function patchWithRetry(url: string, body: unknown, attempt = 0, maxRetries = 3): Promise<HttpsResponse> {
  await rateLimitDelay();

  const response = await httpsRequest(url, 'PATCH', body);

  if (response.status === 401) {
    throw new Error('Priority auth failed — check credentials');
  }

  if (response.status === 429 && attempt < maxRetries) {
    const errMsg = extractErrorMessage(response.body);
    const delay = Math.pow(2, attempt) * 1000;
    console.warn(`[priority] Rate limited on PATCH (${errMsg}) — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return patchWithRetry(url, body, attempt + 1, maxRetries);
  }

  if (response.status >= 500 && attempt < 1) {
    const errMsg = extractErrorMessage(response.body);
    console.warn(`[priority] Server error ${response.status} on PATCH (${errMsg}) — retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return patchWithRetry(url, body, attempt + 1, 1);
  }

  return response;
}
