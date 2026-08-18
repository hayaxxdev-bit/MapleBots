export type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGQUIT';

export interface BotStats {
  messagesProcessed: number;
  commandsExecuted: number;
  errors: number;
  connectedAt: Date;
  uptime: number;
  reconnectAttempts: number;
}

export interface AppServices {
  readonly cache: {
    set<T>(key: string, value: T, ttl?: number): boolean;
    get<T>(key: string): T | undefined;
  };
  readonly database: {
    ping(): Promise<boolean>;
    dispose(): Promise<void>;
  };
  readonly scraperManager: {
    healthCheck(): Promise<readonly { status: string }[]>;
  };
}

export interface ServiceHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latency?: number;
  readonly lastCheck: Date;
  readonly details?: Record<string, unknown>;
}

export interface BootstrapOptions {
  readonly enableHealthChecks?: boolean;
  readonly enableMetrics?: boolean;
  readonly gracefulShutdownTimeout?: number;
}
