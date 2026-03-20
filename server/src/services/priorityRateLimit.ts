// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityRateLimit.ts
// PURPOSE: Rate limiting for Priority API. Rolling window tracks
//          requests to stay under 100/min with minimum spacing.
// USED BY: services/priorityHttp.ts
// EXPORTS: rateLimitDelay
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
