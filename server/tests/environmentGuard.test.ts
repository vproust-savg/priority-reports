// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/environmentGuard.test.ts
// PURPOSE: Production boots must declare PRIORITY_ENV explicitly —
//          the schema default is 'uat', so an unset Railway variable
//          would silently serve UAT as "Live" (Codex finding 2).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { assertExplicitPriorityEnvInProduction } from '../src/config/environment';

describe('assertExplicitPriorityEnvInProduction', () => {
  it('throws when NODE_ENV=production and PRIORITY_ENV is unset', () => {
    expect(() => assertExplicitPriorityEnvInProduction('production', undefined))
      .toThrow(/PRIORITY_ENV must be set explicitly in production/);
  });

  it('passes when NODE_ENV=production and PRIORITY_ENV is set', () => {
    expect(() => assertExplicitPriorityEnvInProduction('production', 'production')).not.toThrow();
    expect(() => assertExplicitPriorityEnvInProduction('production', 'uat')).not.toThrow();
  });

  it('passes in development/test regardless', () => {
    expect(() => assertExplicitPriorityEnvInProduction('development', undefined)).not.toThrow();
    expect(() => assertExplicitPriorityEnvInProduction('test', undefined)).not.toThrow();
  });
});
