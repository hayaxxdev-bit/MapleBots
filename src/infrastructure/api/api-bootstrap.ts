import { apiRegistry } from './api-registry';
import type {
  ApiProvider,
  ApiProviderConfig,
} from './api-types';

let initialized = false;

const providers: Array<{
  provider: ApiProvider;
  config: ApiProviderConfig;
}> = [];

export function registerApiProvider(
  provider: ApiProvider,
  providerConfig: ApiProviderConfig = {},
): void {
  const existing = providers.some(
    (entry) => entry.provider.id === provider.id,
  );

  if (existing) {
    throw new Error(
      `API provider already queued for registration: ${provider.id}`,
    );
  }

  providers.push({
    provider,
    config: providerConfig,
  });
}

export function registerApiProviders(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  for (const entry of providers) {
    const providerConfig = entry.config;
    const provider = entry.provider;

    if (apiRegistry.has(provider.id)) {
      continue;
    }

    apiRegistry.register(provider, {
      ...providerConfig,

      id: provider.id,

      name:
        providerConfig.name ??
        provider.name,

      category:
        providerConfig.category ??
        provider.category,

      enabled:
        providerConfig.enabled ??
        provider.isEnabled(),

      configured:
        providerConfig.configured ??
        true,
    });
  }
}

export function getRegisteredApiProviders(): readonly ApiProvider[] {
  return providers.map(
    ({ provider }) => provider,
  );
}