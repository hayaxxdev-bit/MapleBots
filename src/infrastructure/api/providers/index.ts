import { config } from '../../../config/config';
import { registerApiProvider } from '../api-bootstrap';

import { jikanProvider } from './jikan.provider';
import { waifuProvider } from './waifu.provider';

export function registerBuiltinApiProviders(): void {
  registerApiProvider(jikanProvider, {
    id: jikanProvider.id,
    name: jikanProvider.name,
    category: jikanProvider.category,
    enabled: config.useJikanApi,
    configured: Boolean(config.jikanBaseUrl),
    baseUrl: config.jikanBaseUrl,
    timeoutMs: config.jikanTimeout,
    priority: 100,
  });

  registerApiProvider(waifuProvider, {
    id: waifuProvider.id,
    name: waifuProvider.name,
    category: waifuProvider.category,
    enabled: waifuProvider.isEnabled(),
    configured: Boolean(config.waifuIm),
    baseUrl: config.waifuIm,
    timeoutMs: config.scraperTimeout,
    priority: 90,
    requiresApiKey: false,
  });
}
