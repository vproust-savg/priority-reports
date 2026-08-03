// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/priority.ts
// PURPOSE: Priority API configuration with environment switching.
//          Reads PRIORITY_ENV to select UAT or Production credentials,
//          with a request-scoped override via priorityEnvContext
//          (GRV UAT/Live toggle). Same host and ini file for both —
//          only company code differs.
// USED BY: services/priorityClient.ts, services/priorityHttp.ts
// EXPORTS: getPriorityConfig, PriorityConfig
// ═══════════════════════════════════════════════════════════════

import { env } from './environment';
import { getRequestPriorityEnv } from './priorityEnvContext';

export interface PriorityConfig {
  baseUrl: string;
  username: string;
  password: string;
  env: 'uat' | 'production';
}

export function getPriorityConfig(): PriorityConfig {
  // WHY: Request-scoped override first (GRV UAT/Live toggle), boot env
  // otherwise. Routes set the override only for reports with
  // allowEnvOverride — write paths never set it, so they always use
  // the boot environment.
  const envName = getRequestPriorityEnv() ?? env.PRIORITY_ENV;
  const isProduction = envName === 'production';

  const baseUrl = isProduction ? env.PRIORITY_PROD_BASE_URL : env.PRIORITY_UAT_BASE_URL;
  const username = isProduction ? env.PRIORITY_PROD_USERNAME : env.PRIORITY_UAT_USERNAME;
  const password = isProduction ? env.PRIORITY_PROD_PASSWORD : env.PRIORITY_UAT_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      `Missing Priority ${envName} credentials. Check PRIORITY_${envName === 'production' ? 'PROD' : 'UAT'}_* env vars.`
    );
  }

  return { baseUrl, username, password, env: envName };
}
