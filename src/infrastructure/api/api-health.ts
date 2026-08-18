import { apiRegistry } from './api-registry';
import {
  type ApiHealth,
  type ApiHealthResult,
  type ApiProviderStatus,
  type ApiRegistrySnapshot,
} from './api-types';
import { logger } from '../logging/logger';

/**
 * API health check cache.
 *
 * undefined = belum pernah dilakukan
 * array    = hasil health check pertama
 *
 * Cache ini berlaku selama lifetime process.
 */
let healthCache: ApiHealthResult[] | undefined;

/**
 * Promise cache.
 *
 * Digunakan untuk mencegah dua health check berjalan
 * bersamaan saat cache masih kosong.
 */
let healthCheckPromise: Promise<ApiHealthResult[]> | undefined;

export async function checkApiHealth(id: string): Promise<ApiHealthResult> {
  const entry = apiRegistry.tryGetEntry(id);

  if (!entry) {
    return {
      id,
      name: id,
      category: 'other',
      health: {
        status: 'unknown',
        message: 'Provider not registered.',
        checkedAt: new Date(),
      },
    };
  }

  const { provider, config } = entry;

  const enabled = config.enabled ?? provider.isEnabled();

  if (!enabled) {
    return {
      id: provider.id,
      name: config.name ?? provider.name,
      category: config.category ?? provider.category,
      health: {
        status: 'disabled',
        message: 'Provider is disabled.',
        checkedAt: new Date(),
      },
    };
  }

  const startedAt = Date.now();

  try {
    const health = await provider.healthCheck();

    const latencyMs = health.latencyMs ?? Date.now() - startedAt;

    return {
      id: provider.id,
      name: config.name ?? provider.name,
      category: config.category ?? provider.category,
      health: {
        ...health,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    logger.warn(
      {
        provider: provider.id,
        error,
        latencyMs,
      },
      'API health check failed'
    );

    return {
      id: provider.id,
      name: config.name ?? provider.name,
      category: config.category ?? provider.category,
      health: {
        status: 'unhealthy',
        latencyMs,
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      },
    };
  }
}

/**
 * Perform the actual API health checks.
 *
 * This function is intentionally private.
 */
async function performAllApiHealthChecks(): Promise<ApiHealthResult[]> {
  return Promise.all(apiRegistry.getIds().map((id) => checkApiHealth(id)));
}

/**
 * Check all API providers.
 *
 * IMPORTANT:
 *
 * Health checks are performed only once per process.
 *
 * Subsequent calls return the cached result.
 */
export async function checkAllApiHealth(): Promise<ApiHealthResult[]> {
  /**
   * Already completed.
   */
  if (healthCache !== undefined) {
    return healthCache;
  }

  /**
   * Another caller is already performing
   * the initial health check.
   *
   * Reuse the same Promise instead of sending
   * another request to every provider.
   */
  if (healthCheckPromise !== undefined) {
    return healthCheckPromise;
  }

  healthCheckPromise = performAllApiHealthChecks();

  try {
    healthCache = await healthCheckPromise;

    return healthCache;
  } finally {
    healthCheckPromise = undefined;
  }
}

/**
 * Return the cached API health result.
 *
 * Does NOT perform a health check.
 */
export function getCachedApiHealth(): ApiHealthResult[] {
  return healthCache ?? [];
}

/**
 * Whether the initial API health check has completed.
 */
export function hasApiHealthCache(): boolean {
  return healthCache !== undefined;
}

/**
 * Build dashboard registry snapshot.
 *
 * IMPORTANT:
 * This function uses checkAllApiHealth(), which means
 * it automatically benefits from the one-shot cache.
 */
export async function getApiRegistrySnapshot(): Promise<ApiRegistrySnapshot> {
  const results = await checkAllApiHealth();

  const statuses: ApiProviderStatus[] = results.map((result) => {
    const entry = apiRegistry.tryGetEntry(result.id);
    const config = entry?.config;
    const provider = entry?.provider;

    return {
      id: result.id,
      name: result.name,
      category: result.category,
      enabled: Boolean(config?.enabled ?? provider?.isEnabled()),
      configured: config?.configured ?? true,
      status: result.health.status,
      latency: result.health.latencyMs,
      endpoint: config?.baseUrl,
      message: result.health.message,
      lastChecked: result.health.checkedAt.toISOString(),
      priority: config?.priority,
      requiresApiKey: config?.requiresApiKey,
    };
  });

  return apiRegistry.createSnapshot(statuses);
}
