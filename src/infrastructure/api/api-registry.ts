import {
  type ApiCategory,
  type ApiProvider,
  type ApiProviderConfig,
  type ApiProviderStatus,
  type ApiRegistryEntry,
  type ApiRegistrySnapshot,
} from './api-types';

class ApiRegistry {
  private readonly providers = new Map<string, ApiRegistryEntry>();

  register(provider: ApiProvider, config: ApiProviderConfig = {}): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`API provider already registered: ${provider.id}`);
    }

    if (config.id && config.id !== provider.id) {
      throw new Error(`API provider config id mismatch: ${config.id} !== ${provider.id}`);
    }

    this.providers.set(provider.id, {
      provider,
      config: {
        ...config,
        id: provider.id,
        name: config.name ?? provider.name,
        category: config.category ?? provider.category,
        enabled: config.enabled ?? provider.isEnabled(),
      },
    });
  }

  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  get(id: string): ApiProvider {
    const entry = this.providers.get(id);
    if (!entry) {
      throw new Error(`API provider not found: ${id}`);
    }
    return entry.provider;
  }

  getEntry(id: string): ApiRegistryEntry {
    const entry = this.providers.get(id);
    if (!entry) {
      throw new Error(`API provider not found: ${id}`);
    }
    return entry;
  }

  tryGet(id: string): ApiProvider | undefined {
    return this.providers.get(id)?.provider;
  }

  tryGetEntry(id: string): ApiRegistryEntry | undefined {
    return this.providers.get(id);
  }

  getAll(): ApiProvider[] {
    return [...this.providers.values()].map(({ provider }) => provider);
  }

  getEntries(): ApiRegistryEntry[] {
    return [...this.providers.values()];
  }

  getEnabled(): ApiProvider[] {
    return this.getAll().filter((provider) => {
      const entry = this.providers.get(provider.id);
      return Boolean(entry?.config.enabled ?? provider.isEnabled());
    });
  }

  getByCategory(category: ApiCategory): ApiProvider[] {
    return this.getEnabled().filter((provider) => provider.category === category);
  }

  getIds(): string[] {
    return [...this.providers.keys()];
  }

  get size(): number {
    return this.providers.size;
  }

  createSnapshot(statuses: readonly ApiProviderStatus[] = []): ApiRegistrySnapshot {
    const statusMap = new Map(statuses.map((status) => [status.id, status]));
    const providers: ApiProviderStatus[] = this.getEntries().map(({ provider, config }) => {
      const existing = statusMap.get(provider.id);
      const enabled = config.enabled ?? provider.isEnabled();
      const configured = config.configured ?? true;

      return (
        existing ?? {
          id: provider.id,
          name: config.name ?? provider.name,
          category: config.category ?? provider.category,
          enabled,
          configured,
          status: enabled ? ('unknown' as const) : ('disabled' as const),
          endpoint: config.baseUrl,
          priority: config.priority,
          requiresApiKey: config.requiresApiKey,
        }
      );
    });

    return {
      providers,
      total: providers.length,
      enabled: providers.filter((p) => p.enabled).length,
      configured: providers.filter((p) => p.configured).length,
      healthy: providers.filter((p) => p.status === 'healthy').length,
      degraded: providers.filter((p) => p.status === 'degraded').length,
      unhealthy: providers.filter((p) => p.status === 'unhealthy').length,
      unknown: providers.filter((p) => p.status === 'unknown').length,
      disabled: providers.filter((p) => p.status === 'disabled').length,
      timestamp: new Date().toISOString(),
    };
  }

  clear(): void {
    this.providers.clear();
  }
}

export const apiRegistry = new ApiRegistry();
export { ApiRegistry };
