// src/infrastructure/api/providers/nekos.provider.ts

import type { ApiProvider } from '../api-types';
import { apiClient } from '../api-client';
import { config } from '../../../config/config';

const BASE_URL = 'https://nekos.best/api/v2';

const DEFAULT_TIMEOUT = 15_000;

export interface NekosEndpoint {
  format: string;
}

export type NekosEndpoints = Record<string, NekosEndpoint>;

export interface NekosResult {
  url: string;
  anime_name?: string;
  artist_name?: string;
  artist_href?: string;
  source_url?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface NekosResponse {
  results: NekosResult[];
}

function getUserAgent(): string {
  const userAgent = process.env['NEKOS_USER_AGENT']?.trim();

  if (!userAgent) {
    throw new Error('NEKOS_USER_AGENT is not configured.');
  }

  return userAgent;
}

function getHeaders(): Record<string, string> {
  return {
    'User-Agent': getUserAgent(),
  };
}

export const nekosProvider: ApiProvider = {
  id: 'nekos-best',

  name: 'Nekos.best',

  category: 'image',

  isEnabled(): boolean {
    return Boolean(config.features['nekos']);
  },

  async healthCheck() {
    const startedAt = Date.now();

    try {
      await apiClient.get<NekosEndpoints>(`${BASE_URL}/endpoints`, {
        timeoutMs: DEFAULT_TIMEOUT,
        headers: getHeaders(),
      });

      return {
        status: 'healthy',
        latencyMs: Date.now() - startedAt,
        message: 'Nekos.best API is reachable.',
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

    return apiClient.get<T>(`${BASE_URL}${endpoint}`, {
      ...requestOptions,
      headers: {
        ...getHeaders(),
        ...requestOptions?.headers,
      },
    });
  },
};

export async function getNekosEndpoints(): Promise<NekosEndpoints> {
  return nekosProvider.request<NekosEndpoints>('/endpoints');
}

export async function getNekos(category = 'neko', amount = 1): Promise<NekosResult[]> {
  const safeAmount = Math.max(1, Math.min(20, amount));

  const params = new URLSearchParams({
    amount: String(safeAmount),
  });

  const response = await nekosProvider.request<NekosResponse>(
    `/${encodeURIComponent(category)}?${params.toString()}`
  );

  return response.results ?? [];
}

export async function downloadNekosAsset(url: string): Promise<Buffer> {
  return apiClient.getBuffer(url, {
    timeoutMs: DEFAULT_TIMEOUT,
    headers: getHeaders(),
  });
}