// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityRateLimit.ts
// PURPOSE: Rate limiting and error extraction for Priority API.
//          Rolling window tracks requests to stay under 100/min.
//          Error extractor parses Priority's two JSON error formats.
// USED BY: services/priorityClient.ts
// EXPORTS: rateLimitDelay, extractErrorMessage
// ═══════════════════════════════════════════════════════════════

const MIN_SPACING_MS = 200;
const WINDOW_MS = 60_000;
// WHY: 95 not 100 — leave margin so we never actually hit Priority's 100/min hard limit
const MAX_REQUESTS_PER_WINDOW = 95;
const requestTimestamps: number[] = [];

export async function rateLimitDelay(): Promise<void> {
  const now = Date.now();

  // Prune entries older than 60s
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > WINDOW_MS) {
    requestTimestamps.shift();
  }

  // If at capacity, wait until oldest entry ages out
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const waitMs = WINDOW_MS - (now - requestTimestamps[0]) + 10;
    console.warn(`[priority] Rate limit window full — waiting ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  // Enforce minimum spacing between consecutive requests
  if (requestTimestamps.length > 0) {
    const elapsed = Date.now() - requestTimestamps[requestTimestamps.length - 1];
    if (elapsed < MIN_SPACING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_SPACING_MS - elapsed));
    }
  }

  requestTimestamps.push(Date.now());
}

// WHY: Priority returns errors in two JSON formats. Without parsing these,
// logs only show "400 Bad Request" with no actionable detail.
export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const data = JSON.parse(text);

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

    // Fall back to raw text (truncated)
    return text.slice(0, 200);
  } catch {
    return response.statusText;
  }
}
