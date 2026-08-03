// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/priorityEnvContext.test.ts
// PURPOSE: Verify the request-scoped Priority environment context
//          propagates through the async shapes enrichRows uses
//          (await, Promise.all, setTimeout) and never bleeds
//          between interleaved scopes.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { runWithPriorityEnv, getRequestPriorityEnv } from '../src/config/priorityEnvContext';

describe('priorityEnvContext', () => {
  it('returns undefined outside any scope', () => {
    expect(getRequestPriorityEnv()).toBeUndefined();
  });

  it('runs the callback without a scope when env is undefined', () => {
    const seen = runWithPriorityEnv(undefined, () => getRequestPriorityEnv());
    expect(seen).toBeUndefined();
  });

  it('survives await + Promise.all + setTimeout (the enrichRows shape)', async () => {
    const seen = await runWithPriorityEnv('uat', async () => {
      await new Promise((r) => setTimeout(r, 5)); // batch delay
      const batch = await Promise.all([
        Promise.resolve().then(() => getRequestPriorityEnv()),
        new Promise<string | undefined>((r) => setTimeout(() => r(getRequestPriorityEnv()), 5)),
      ]);
      return batch;
    });
    expect(seen).toEqual(['uat', 'uat']);
  });

  it('does not bleed between interleaved scopes', async () => {
    const [a, b] = await Promise.all([
      runWithPriorityEnv('uat', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestPriorityEnv();
      }),
      runWithPriorityEnv('production', async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestPriorityEnv();
      }),
    ]);
    expect(a).toBe('uat');
    expect(b).toBe('production');
  });
});
