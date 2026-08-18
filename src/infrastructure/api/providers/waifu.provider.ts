import type { ApiHealth, ApiProvider } from '../api-types';
import { apiClient } from '../api-client';
import { config } from '../../../config/config';

const BASE_URL = config.waifuIm || 'https://api.waifu.im';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getApiKey(): string | undefined {
  const key = config.apiKeys?.['waifuIm'];

  return key?.trim() || undefined;
}

export const waifuProvider: ApiProvider = {
  id: 'waifu-im',

  name: 'Waifu.im',

  category: 'image',

  isEnabled(): boolean {
    return Boolean(config.features['waifu']);
  },

  async healthCheck(): Promise<ApiHealth> {
    const startedAt = Date.now();
    const checkedAt = new Date();

    try {
      await apiClient.get(`${normalizeBaseUrl(BASE_URL)}/images?PageSize=1&IsNsfw=False`, {
        timeoutMs: config.scraperTimeout,
        headers: getApiKey()
          ? {
              'X-Api-Key': getApiKey()!,
            }
          : undefined,
      });

      return {
        status: 'healthy',
        latencyMs: Date.now() - startedAt,
        message: 'Waifu.im API is reachable.',
        checkedAt,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        checkedAt,
      };
    }
  },

  async request<T>(operation: string, payload?: unknown): Promise<T> {
    const baseUrl = normalizeBaseUrl(BASE_URL);

    const apiKey = getApiKey();

    const headers = apiKey
      ? {
          'X-Api-Key': apiKey,
        }
      : undefined;

    switch (operation) {
      case 'random-image': {
        return apiClient.get<T>(`${baseUrl}/images`, {
          headers,
        });
      }

      case 'tags': {
        return apiClient.get<T>(`${baseUrl}/tags`, {
          headers,
        });
      }

      case 'images': {
        const params =
          payload && typeof payload === 'object'
            ? new URLSearchParams(
                Object.entries(payload as Record<string, unknown>)
                  .filter(([, value]) => value !== undefined && value !== null)
                  .map(([key, value]) => [key, String(value)] as [string, string]) // <-- Perbaikan di sini
              ).toString()
            : '';

        return apiClient.get<T>(`${baseUrl}/images${params ? `?${params}` : ''}`, {
          headers,
        });
      }

      default:
        throw new Error(`Unsupported Waifu.im operation: ${operation}`);
    }
  },
};
