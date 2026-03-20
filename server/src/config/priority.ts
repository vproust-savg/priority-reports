// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/priority.ts
// PURPOSE: Priority API configuration with environment switching.
//          Reads PRIORITY_ENV to select UAT or Production credentials.
//          Same host and ini file for both — only company code differs.
// USED BY: services/priorityClient.ts
// EXPORTS: getPriorityConfig, PriorityConfig
// ═══════════════════════════════════════════════════════════════

import { env } from './environment';

export interface PriorityConfig {
  baseUrl: string;
  username: string;
  password: string;
  env: 'uat' | 'production';
}

export function getPriorityConfig(): PriorityConfig {
  const isProduction = env.PRIORITY_ENV === 'production';

  const baseUrl = isProduction ? env.PRIORITY_PROD_BASE_URL : env.PRIORITY_UAT_BASE_URL;
  const username = isProduction ? env.PRIORITY_PROD_USERNAME : env.PRIORITY_UAT_USERNAME;
  const password = isProduction ? env.PRIORITY_PROD_PASSWORD : env.PRIORITY_UAT_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      `Missing Priority ${env.PRIORITY_ENV} credentials. Check PRIORITY_${env.PRIORITY_ENV.toUpperCase()}_* env vars.`
    );
  }

  return { baseUrl, username, password, env: env.PRIORITY_ENV };
}
