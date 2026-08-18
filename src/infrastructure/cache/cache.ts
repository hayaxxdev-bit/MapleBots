// src/utils/cache.ts
import NodeCache from 'node-cache';
import { config } from '../../config/config';
import { logger } from '../logging/logger';

/**
 * Cache Manager using node-cache for in-memory caching
 * Supports TTL, stats, and multiple cache instances
 */
export class CacheManager {
  private static instance: CacheManager;
  private cache: NodeCache;
  private stats: {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
  };

  private constructor() {
    this.cache = new NodeCache({
      stdTTL: config.scraperCacheTtl,
      checkperiod: config.scraperCacheTtl * 0.2,
      useClones: false,
      deleteOnExpire: true,
      maxKeys: 1000,
    });

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
    };

    // Setup cache events
    this.cache.on('expired', (key: string) => {
      logger.debug(`Cache expired: ${key}`);
    });

    this.cache.on('flush', () => {
      logger.debug('Cache flushed');
    });
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    try {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        this.stats.hits++;
        return value;
      }
      this.stats.misses++;
      return undefined;
    } catch (error) {
      logger.error(error as Error, `Cache get error for key: ${key}`);
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    try {
      const success = this.cache.set(key, value, ttl ?? config.scraperCacheTtl);
      if (success) {
        this.stats.sets++;
      }
      return success;
    } catch (error) {
      logger.error(error as Error, `Cache set error for key: ${key}`);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  delete(key: string): number {
    try {
      const deleted = this.cache.del(key);
      this.stats.deletes += deleted;
      return deleted;
    } catch (error) {
      logger.error(error as Error, `Cache delete error for key: ${key}`);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get multiple values from cache
   */
  getMany<T>(keys: string[]): Record<string, T> {
    try {
      const values = this.cache.mget<T>(keys);
      const validValues: Record<string, T> = {};

      Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined) {
          validValues[key] = value as T;
          this.stats.hits++;
        } else {
          this.stats.misses++;
        }
      });

      return validValues;
    } catch (error) {
      logger.error(error as Error, 'Cache getMany error');
      return {};
    }
  }

  /**
   * Set multiple values in cache
   */
  setMany(values: Record<string, unknown>, ttl?: number): boolean {
    try {
      const success = this.cache.mset(
        Object.entries(values).map(([key, val]) => ({
          key,
          val,
          ttl: ttl ?? config.scraperCacheTtl,
        }))
      );
      return success;
    } catch (error) {
      logger.error(error as Error, 'Cache setMany error');
      return false;
    }
  }

  /**
   * Get or set cache value
   */
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttl);
    return value;
  }

  dispose(): void {
    const cacheWithClose = this.cache as NodeCache & { close?: () => void };
    cacheWithClose.close?.();
    this.cache.flushAll();
  }

  /**
   * Flush all cache
   */
  /**
   * Clear all cache entries
   */
  clear(): Promise<void> {
    try {
      this.cache.flushAll();
      logger.info('Cache cleared');
    } catch (error) {
      logger.error(error as Error, 'Cache clear error');
    }
    return Promise.resolve();
  }
  /**
   * Get cache keys
   */
  getKeys(): string[] {
    return this.cache.keys();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      ...this.stats,
      keys: this.cache.keys().length,
      size: this.cache.getStats(),
    };
  }

  /**
   * Get cache TTL for a key
   */
  getTtl(key: string): number | undefined {
    return this.cache.getTtl(key);
  }

  /**
   * Set cache TTL for a key
   */
  setTtl(key: string, ttl: number): boolean {
    return this.cache.ttl(key, ttl);
  }
}

// Export singleton instance
export default CacheManager;
