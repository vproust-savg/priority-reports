// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/cache.ts
// PURPOSE: Cache abstraction with Upstash Redis implementation.
//          The interface is the contract — swap implementations
//          without touching any business code.
// USED BY: routes/reports.ts
// EXPORTS: CacheProvider, buildCacheKey, createCacheProvider
// ═══════════════════════════════════════════════════════════════

import { Redis } from '@upstash/redis';
import { env } from '../config/environment';

// WHY: Abstraction layer so we can swap from Upstash to Railway Redis
// or any other provider by implementing one file. Business code
// only knows about CacheProvider, never about Upstash directly.
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  isConnected(): Promise<boolean>;
}

// WHY: Cache keys must include ALL query params, not just reportId.
// Otherwise different pages of the same report return wrong cached data.
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string; vendor?: string; status?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 25}:${params.from ?? ''}:${params.to ?? ''}:v${params.vendor ?? ''}:st${params.status ?? ''}`;
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

  async isConnected(): Promise<boolean> {
    return true;
  }
}

export function createCacheProvider(): CacheProvider {
  if (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN) {
    return new UpstashCacheProvider(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN);
  }

  // WHY: Log warning so it's obvious in Railway logs when cache isn't configured.
  console.warn('[cache] No Upstash credentials — using in-memory cache (data lost on restart)');
  return new InMemoryCacheProvider();
}
