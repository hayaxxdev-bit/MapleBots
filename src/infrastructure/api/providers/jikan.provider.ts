import type { ApiProvider } from '../api-types';
import { apiClient } from '../api-client';
import { config } from '../../../config/config';

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  score?: number | null;
  episodes?: number | null;
  status?: string | null;
  synopsis?: string | null;
  images?: {
    jpg?: {
      image_url?: string;
      large_image_url?: string;
    };
  };
}

export interface JikanSearchResponse {
  data: JikanAnime[];
  pagination?: {
    last_visible_page?: number;
    has_next_page?: boolean;
  };
}

export const jikanProvider: ApiProvider = {
  id: 'jikan',

  name: 'Jikan API',

  category: 'anime',

  // Mengganti properti `enabled` menjadi method `isEnabled()`
  isEnabled(): boolean {
    return Boolean(config.useJikanApi);
  },

  async healthCheck() {
    const startedAt = Date.now();

    try {
      await apiClient.get<JikanSearchResponse>(`${config.jikanBaseUrl}/anime?q=naruto&limit=1`, {
        timeoutMs: config.jikanTimeout,
      });

      return {
        status: 'healthy',
        latencyMs: Date.now() - startedAt,
        message: 'Jikan API is reachable.',
        checkedAt: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date(),
      };
    }
  },

  async request<T>(endpoint: string, options?: unknown): Promise<T> {
    const requestOptions = options as
      | (RequestInit & {
          timeoutMs?: number;
          headers?: Record<string, string>;
        })
      | undefined;

    return apiClient.get<T>(`${config.jikanBaseUrl}${endpoint}`, requestOptions);
  },
};
