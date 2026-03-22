// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityRateLimit.ts
// PURPOSE: Rate limiting for Priority API. Serialized queue ensures
//          only one caller proceeds at a time, preventing thundering
//          herd when the window fills up.
// USED BY: services/priorityHttp.ts
// EXPORTS: rateLimitDelay
// ═══════════════════════════════════════════════════════════════

const MIN_SPACING_MS = 200;
const WINDOW_MS = 60_000;
// WHY: 95 not 100 — leave margin so we never actually hit Priority's 100/min hard limit
const MAX_REQUESTS_PER_WINDOW = 95;
const requestTimestamps: number[] = [];

// WHY: Without serialization, all callers waiting on a full window compute
// the same wait time, sleep in parallel, and wake simultaneously — creating
// a thundering herd that immediately re-fills the window. The promise chain
// ensures callers proceed one at a time, each seeing fresh timestamp state.
let queue: Promise<void> = Promise.resolve();

export async function rateLimitDelay(): Promise<void> {
  const ticket = queue.then(() => processSlot());
  queue = ticket.catch(() => {});
  return ticket;
}

async function processSlot(): Promise<void> {
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
    // Re-prune after waiting — timestamps may have aged out
    const afterWait = Date.now();
    while (requestTimestamps.length > 0 && afterWait - requestTimestamps[0] > WINDOW_MS) {
      requestTimestamps.shift();
    }
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
