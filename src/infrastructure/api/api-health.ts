import { apiRegistry } from './api-registry';
import {
  type ApiHealthResult,
  type ApiProviderStatus,
  type ApiRegistrySnapshot,
} from './api-types';
import { logger } from '../logging/logger';

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
        message: error instanceof Error ? error.message : 'Unknown API error',
        checkedAt: new Date(),
      },
    };
  }
}

export async function checkAllApiHealth(): Promise<ApiHealthResult[]> {
  return Promise.all(apiRegistry.getIds().map((id) => checkApiHealth(id)));
}

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
