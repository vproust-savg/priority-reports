// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/environment.ts
// PURPOSE: Centralized environment configuration. Read .env once,
//          export typed config object. All other files import from here.
// USED BY: index.ts, cache.ts, routes, priority.ts
// EXPORTS: env, assertExplicitPriorityEnvInProduction
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// WHY: dotenv sets empty .env values as "" (empty string), but Zod's
// .url().optional() only accepts undefined, not "". This transform
// converts empty strings to undefined so optional URL fields work.
const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined));
const optionalString = z.string().optional().or(z.literal('').transform(() => undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Priority ERP
  PRIORITY_ENV: z.enum(['uat', 'production']).default('uat'),
  PRIORITY_UAT_BASE_URL: optionalUrl,
  PRIORITY_UAT_USERNAME: optionalString,
  PRIORITY_UAT_PASSWORD: optionalString,
  PRIORITY_PROD_BASE_URL: optionalUrl,
  PRIORITY_PROD_USERNAME: optionalString,
  PRIORITY_PROD_PASSWORD: optionalString,

  // Upstash Redis
  UPSTASH_REDIS_URL: optionalUrl,
  UPSTASH_REDIS_TOKEN: optionalString,

  // Airtable (for report status updates)
  AIRTABLE_TOKEN: optionalString,
});

// WHY: Crash on startup if env vars are wrong. This prevents
// Claude Code from ever deploying with missing credentials.
export const env = EnvSchema.parse(process.env);

// WHY: The schema default above is 'uat' (right for local dev). In a
// production deploy an unset PRIORITY_ENV would therefore silently serve
// UAT data as "Live" and point BBD writes at UAT — with valid credentials,
// so nothing would error (Codex finding 2, env-toggle spec §8). Fail the
// boot instead; Railway's healthcheck keeps the previous deploy serving.
// Exported as a pure function so tests cover the matrix without module
// reload games (dotenv would repopulate process.env from ../.env).
export function assertExplicitPriorityEnvInProduction(
  nodeEnv: string,
  rawPriorityEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && !rawPriorityEnv) {
    throw new Error(
      'PRIORITY_ENV must be set explicitly in production (uat | production). ' +
      'Refusing to boot with the implicit uat default.'
    );
  }
}

assertExplicitPriorityEnvInProduction(env.NODE_ENV, process.env.PRIORITY_ENV);
