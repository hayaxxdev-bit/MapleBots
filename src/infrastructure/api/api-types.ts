export type ApiCategory =
  | 'anime'
  | 'manga'
  | 'image'
  | 'downloader'
  | 'ai'
  | 'weather'
  | 'news'
  | 'finance'
  | 'utility'
  | 'game'
  | 'other';

export type ApiHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

export interface ApiHealth {
  readonly status: ApiHealthStatus;
  readonly latencyMs?: number;
  readonly message?: string;
  readonly checkedAt: Date;
}

export interface ApiProvider {
  readonly id: string;
  readonly name: string;
  readonly category: ApiCategory;

  isEnabled(): boolean;

  request<T>(operation: string, payload?: unknown): Promise<T>;

  healthCheck(): Promise<ApiHealth>;
}
export interface ApiProviderConfig {
  readonly id?: string;
  readonly name?: string;
  readonly category?: ApiCategory;
  readonly enabled?: boolean;
  readonly configured?: boolean;
  readonly baseUrl?: string;
  readonly healthEndpoint?: string;
  readonly timeoutMs?: number;
  readonly priority?: number;
  readonly requiresApiKey?: boolean;
  readonly rateLimit?: {
    readonly requests: number;
    readonly windowMs: number;
  };
  readonly metadata?: Record<string, unknown>;
}

export interface ApiRegistryEntry {
  readonly provider: ApiProvider;
  readonly config: ApiProviderConfig;
}

export interface ApiProviderStatus {
  readonly id: string;
  readonly name: string;
  readonly category: ApiCategory;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly status: ApiHealthStatus;
  readonly latency?: number;
  readonly endpoint?: string;
  readonly message?: string;
  readonly lastChecked?: string;
  readonly priority?: number;
  readonly requiresApiKey?: boolean;
}

export interface ApiHealthResult {
  readonly id: string;
  readonly name: string;
  readonly category: ApiCategory;
  readonly health: ApiHealth;
}

export interface ApiRegistrySnapshot {
  readonly providers: readonly ApiProviderStatus[];
  readonly total: number;
  readonly enabled: number;
  readonly configured: number;
  readonly healthy: number;
  readonly degraded: number;
  readonly unhealthy: number;
  readonly unknown: number;
  readonly disabled: number;
  readonly timestamp: string;
}

export interface ApiRequestOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
  readonly signal?: AbortSignal;
}
