// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/cache.ts
// PURPOSE: Cache abstraction with Upstash Redis implementation.
//          The interface is the contract — swap implementations
//          without touching any business code.
// USED BY: routes/reports.ts, routes/filters.ts, routes/query.ts
// EXPORTS: CacheProvider, buildCacheKey, buildQueryCacheKey, buildExportCacheKey, createCacheProvider
// ═══════════════════════════════════════════════════════════════

import { Redis } from '@upstash/redis';
import { env } from '../config/environment';
import type { QueryRequest, FilterGroup, PriorityEnvironment } from '@shared/types';

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidateByPrefix(prefix: string): Promise<number>;
  isConnected(): Promise<boolean>;
}

// WHY: Cache keys must include ALL query params, not just reportId.
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string; vendor?: string; status?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 50}:${params.from ?? ''}:${params.to ?? ''}:v${params.vendor ?? ''}:st${params.status ?? ''}`;
}

// WHY: Strip condition/group `id` fields before hashing. These are random
// UUIDs used as React keys — two logically identical filters with different
// UUIDs must produce the same cache key. Without this, cache warming
// (server-generated IDs) would never match client requests.
function stripIds(group: FilterGroup): unknown {
  return {
    conjunction: group.conjunction,
    conditions: group.conditions.map(c => ({
      field: c.field, operator: c.operator, value: c.value, valueTo: c.valueTo,
    })),
    groups: group.groups.map(stripIds),
  };
}

// WHY: resolvedEnv (requested ?? boot PRIORITY_ENV) in the key material —
// UAT and Live cache entries can never collide (spec §5). Uses the
// RESOLVED env, not the raw request field, so local dev (boot uat) keys
// truthfully. Old un-scoped keys age out via TTL (same self-versioning
// pattern as the V8491 base-filter change).
export function buildQueryCacheKey(
  reportId: string,
  body: QueryRequest,
  resolvedEnv: PriorityEnvironment,
): string {
  const filterHash = JSON.stringify(stripIds(body.filterGroup));
  return `query:${reportId}:env${resolvedEnv}:p${body.page}:s${body.pageSize}:${filterHash}`;
}

// WHY: baseFilter in the key material self-versions the export cache —
// pages cached before a report's base $filter changed (e.g. the V8491
// exclusion, 2026-08-03) can never be served afterward. Old keys age out
// via the 15-minute TTL; no manual invalidation step to forget.
// envN segment: see buildQueryCacheKey.
export function buildExportCacheKey(
  reportId: string,
  filterGroup: FilterGroup,
  page: number,
  baseFilter: string | undefined,
  resolvedEnv: PriorityEnvironment,
): string {
  const filterHash = JSON.stringify(stripIds(filterGroup));
  return `export:${reportId}:env${resolvedEnv}:p${page}:s5000:bf${baseFilter ?? ''}:${filterHash}`;
}

class UpstashCacheProvider implements CacheProvider {
  private client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(data), { ex: ttlSeconds });
  }

  async invalidate(key: string): Promise<void> {
    await this.client.del(key);
  }

  // WHY: SCAN-based deletion for prefix matching. Upstash REST supports
  // SCAN with MATCH pattern. Deletes all keys matching the prefix.
  async invalidateByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    do {
      const result: [string, string[]] = await this.client.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = String(result[0]);
      const keys = result[1];
      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');
    return deleted;
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { data: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async invalidate(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidateByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async isConnected(): Promise<boolean> {
    return true;
  }
}

export function createCacheProvider(): CacheProvider {
  if (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN) {
    return new UpstashCacheProvider(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN);
  }
  console.warn('[cache] No Upstash credentials — using in-memory cache (data lost on restart)');
  return new InMemoryCacheProvider();
}
