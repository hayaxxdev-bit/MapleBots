// src/infrastructure/notification/notification-types.ts

export enum NotificationType {
  BOT_ONLINE = 'bot_online',
  BOT_OFFLINE = 'bot_offline',
  ERROR = 'error',
  CRASH = 'crash',
  DATABASE_BACKUP = 'database_backup',
  HEALTH_CHECK = 'health_check',
  SECURITY_ALERT = 'security_alert',
  UPDATE_AVAILABLE = 'update_available',
  RATE_LIMIT = 'rate_limit',
  SCRAPER_ERROR = 'scraper_error',
}

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationPayload {
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly priority: NotificationPriority;
  readonly metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  readonly name: string;

  send(payload: NotificationPayload): Promise<void>;
}

export interface NotificationOptions {
  readonly retryAttempts?: number;
  readonly retryDelay?: number;
  readonly timeout?: number;
}
