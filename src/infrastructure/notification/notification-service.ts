// src/infrastructure/notification/notification-service.ts
import { logger } from '../logging/logger';
import { config } from '../../config/config';
import { metrics } from '../metrics/metrics';
import {
  NotificationPayload,
  NotificationType,
  NotificationChannel,
  NotificationOptions,
} from './notification-types';

export class NotificationService {
  private static instance: NotificationService;
  private channels: Map<string, NotificationChannel> = new Map();
  private notificationHistory: NotificationPayload[] = [];
  private readonly maxHistorySize = 100;
  private isSending = false;
  private queue: NotificationPayload[] = [];
  private retryCount: Map<string, number> = new Map();
  private queueTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.processQueue();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
    logger.debug(`Notification channel registered: ${channel.name}`);
  }

  send(payload: NotificationPayload, _options?: NotificationOptions): Promise<void> {
    // FIX TS2540: Buat objek baru untuk menghindari mutasi properti readonly
    const fullPayload: NotificationPayload = {
      ...payload,
      timestamp: payload.timestamp ?? new Date(),
    };

    // Add to history
    this.addToHistory(fullPayload);

    // Add to queue
    this.queue.push(fullPayload);

    // Record metrics
    metrics.record('notification_queued', 1, {
      type: fullPayload.type,
      priority: fullPayload.priority,
    });

    logger.debug(`Notification queued: ${fullPayload.type} - ${fullPayload.title}`);

    return Promise.resolve();
  }

  async sendImmediate(payload: NotificationPayload, options?: NotificationOptions): Promise<void> {
    const maxRetries = options?.retryAttempts ?? 3;
    const retryDelay = options?.retryDelay ?? 1000;
    const timeout = options?.timeout ?? 5000;

    // Direct assignment to payload or clone if needed
    const fullPayload: NotificationPayload = {
      ...payload,
      timestamp: payload.timestamp ?? new Date(),
    };

    const channels = this.getChannelsForNotification(fullPayload);

    for (const channel of channels) {
      let attempts = 0;
      let success = false;

      while (attempts < maxRetries && !success) {
        attempts++;

        try {
          await Promise.race([
            channel.send(fullPayload),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Notification timeout')), timeout);
            }),
          ]);

          success = true;
          logger.debug(`Notification sent via ${channel.name}: ${fullPayload.type}`);

          // Record metrics
          metrics.record('notification_sent', 1, {
            channel: channel.name,
            type: fullPayload.type,
          });
        } catch (error) {
          logger.warn(
            error as Error,
            `Failed to send notification via ${channel.name} (attempt ${attempts}/${maxRetries}):`
          );

          if (attempts < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          } else {
            // Record failure
            metrics.record('notification_failed', 1, {
              channel: channel.name,
              type: fullPayload.type,
            });
          }
        }
      }
    }
  }

  private processQueue(): void {
    if (this.queueTimer) {
      return;
    }

    this.queueTimer = setInterval(() => {
      void (async () => {
        if (this.isSending || this.queue.length === 0) {
          return;
        }

        this.isSending = true;
        const payload = this.queue.shift();
        if (!payload) {
          this.isSending = false;
          return;
        }

        try {
          await this.sendImmediate(payload);
        } catch (error) {
          logger.error(error as Error, 'Failed to process notification from queue:');
        } finally {
          this.isSending = false;
        }
      })();
    }, 1000);
  }

  dispose(): void {
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }

    this.queue = [];
    this.channels.clear();
  }

  private getChannelsForNotification(payload: NotificationPayload): NotificationChannel[] {
    const channels: NotificationChannel[] = [];

    // Get channels based on notification type and priority
    this.channels.forEach((channel) => {
      if (payload.priority === 'critical' || payload.priority === 'high') {
        // Send critical/high priority to all channels
        channels.push(channel);
      } else if (
        payload.type === NotificationType.BOT_ONLINE ||
        payload.type === NotificationType.BOT_OFFLINE
      ) {
        // Always send online/offline notifications
        channels.push(channel);
      } else if (config.notifyOnError && payload.type === NotificationType.ERROR) {
        channels.push(channel);
      } else if (config.notifyOnCrash && payload.type === NotificationType.CRASH) {
        channels.push(channel);
      }
    });

    return channels;
  }

  private addToHistory(payload: NotificationPayload): void {
    this.notificationHistory.push(payload);

    // Keep only last N notifications
    if (this.notificationHistory.length > this.maxHistorySize) {
      this.notificationHistory.shift();
    }
  }

  getHistory(type?: NotificationType): NotificationPayload[] {
    if (type) {
      return this.notificationHistory.filter((n) => n.type === type);
    }
    return this.notificationHistory;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
    logger.info('Notification queue cleared');
  }

  async sendBotOnlineNotification(
    uptime: number,
    version?: string,
    details?: {
      whatsappUser?: {
        id: string;
        name?: string;
      };
      startupTimeMs?: number;
      pid?: number;
      nodeVersion?: string;
      platform?: string;
      architecture?: string;
      dashboardUrl?: string;
      apiProviders?: {
        total: number;
        enabled: number;
        healthy: number;
        unhealthy: number;
      };
      featuresEnabled?: number;
    }
  ): Promise<void> {
    const now = new Date();

    const whatsappUser = details?.whatsappUser;
    const api = details?.apiProviders;

    const sections: string[] = [];

    sections.push(
      '🤖 *MAPLEBOT ONLINE*',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '📱 *Bot*',
      config.botName,
      '',
      '🟢 *Status*',
      'WhatsApp Connected',
      ''
    );

    if (whatsappUser?.id) {
      const whatsappNumber = whatsappUser.id.split(':')[0];

      sections.push('👤 *Account*', whatsappUser.name ?? whatsappNumber!, whatsappNumber!, '');
    }

    sections.push(
      '🌐 *Environment*',
      config.isProduction ? 'production' : 'development',
      '',
      '🔧 *Mode*',
      config.botMode,
      ''
    );

    if (details?.startupTimeMs !== undefined && details?.startupTimeMs !== null) {
      sections.push('⏱️ *Startup*', `${details.startupTimeMs}ms`, '');
    }

    sections.push(
      '🖥️ *Runtime*',
      `Node.js ${details?.nodeVersion ?? process.version}`,
      `${details?.platform ?? process.platform} ${details?.architecture ?? process.arch}`,
      '',
      '⚙️ *Process*',
      `PID: ${details?.pid ?? process.pid}`,
      ''
    );

    if (api) {
      sections.push(
        '🔌 *API Providers*',
        `${api.total} total`,
        `${api.enabled} enabled`,
        `${api.healthy} healthy`,
        `${api.unhealthy} unhealthy`,
        ''
      );
    }

    if (details?.featuresEnabled !== undefined && details?.featuresEnabled !== null) {
      sections.push('🧩 *Features*', `${details.featuresEnabled} enabled`, '');
    }

    if (details?.dashboardUrl) {
      sections.push('🌐 *Dashboard*', details.dashboardUrl, '');
    }

    sections.push(
      '⏰ *Started*',
      now.toISOString(),
      '',
      '━━━━━━━━━━━━━━━━━━',
      '🍁 MapleBot siap digunakan.'
    );

    const payload: NotificationPayload = {
      type: NotificationType.BOT_ONLINE,
      title: '🤖 MapleBot Online',
      message: sections.join('\n'),
      priority: 'high',
      timestamp: now,

      metadata: {
        botName: config.botName,
        environment: config.isProduction ? 'production' : 'development',

        mode: config.botMode,

        whatsappUser,

        startupTimeMs: details?.startupTimeMs,

        version,

        pid: details?.pid ?? process.pid,

        nodeVersion: details?.nodeVersion ?? process.version,

        platform: details?.platform ?? process.platform,

        architecture: details?.architecture ?? process.arch,

        dashboardUrl: details?.dashboardUrl,

        apiProviders: api,

        featuresEnabled: details?.featuresEnabled,

        uptime,

        startedAt: now,
      },
    };

    await this.send(payload);
  }

  async sendBotOfflineNotification(reason: string, uptime: number): Promise<void> {
    const payload: NotificationPayload = {
      type: NotificationType.BOT_OFFLINE,
      title: '🔴 Bot Offline',
      message:
        `Bot telah berhenti beroperasi.\n\n` +
        `⏱️ Total Uptime: ${this.formatUptime(uptime)}\n` +
        `📋 Reason: ${reason}\n` +
        `⏰ Time: ${new Date().toISOString()}`,
      priority: 'critical',
      timestamp: new Date(),
      metadata: {
        reason,
        uptime,
        timestamp: new Date(),
      },
    };

    await this.send(payload);
  }

  async sendErrorNotification(
    error: Error,
    context?: {
      module?: string;
      command?: string;
      sender?: string;
      senderName?: string;
      chatId?: string;
      action?: string;
    }
  ): Promise<void> {
    const now = new Date();

    const payload: NotificationPayload = {
      type: NotificationType.ERROR,

      title: '⚠️ MapleBot Error',

      message:
        `⚠️ *MAPLEBOT ERROR*\n\n` +
        `🤖 *Bot*\n` +
        `${config.botName}\n\n` +
        `🌐 *Environment*\n` +
        `${config.isProduction ? 'production' : 'development'}\n\n` +
        `📦 *Module*\n` +
        `${context?.module ?? 'Unknown'}\n\n` +
        `⚙️ *Action*\n` +
        `${context?.action ?? 'Unknown'}\n\n` +
        `💬 *Command*\n` +
        `${context?.command ?? 'Not a command'}\n\n` +
        `👤 *Sender*\n` +
        `${context?.senderName ?? 'Unknown'}\n` +
        `${context?.sender ?? 'Unknown'}\n\n` +
        `💬 *Chat ID*\n` +
        `${context?.chatId ?? 'Unknown'}\n\n` +
        `❌ *Error*\n` +
        `${error.message}\n\n` +
        `⏰ *Time*\n` +
        `${now.toISOString()}\n\n` +
        `📚 *Stack*\n` +
        `${error.stack?.slice(0, 1500) ?? 'No stack available'}`,

      priority: 'high',

      timestamp: now,

      metadata: {
        botName: config.botName,
        environment: config.isProduction ? 'production' : 'development',

        module: context?.module,
        command: context?.command,
        sender: context?.sender,
        senderName: context?.senderName,
        chatId: context?.chatId,
        action: context?.action,

        errorMessage: error.message,
        stack: error.stack,
        timestamp: now,
      },
    };

    await this.send(payload);
  }

  async sendCrashNotification(error: Error): Promise<void> {
    const payload: NotificationPayload = {
      type: NotificationType.CRASH,
      title: '💥 Bot Crash',
      message:
        `Bot mengalami crash fatal!\n\n` +
        `❌ Error: ${error.message}\n` +
        `📍 Stack: ${error.stack?.slice(0, 1000)}\n` +
        `⏰ Time: ${new Date().toISOString()}\n\n` +
        `Bot akan restart otomatis...`,
      priority: 'critical',
      timestamp: new Date(),
      metadata: {
        errorMessage: error.message,
        fullStack: error.stack,
        crashTime: new Date(),
      },
    };

    await this.sendImmediate(payload);
  }

  async sendDatabaseBackupNotification(backupPath: string, size: number): Promise<void> {
    const payload: NotificationPayload = {
      type: NotificationType.DATABASE_BACKUP,
      title: '💾 Database Backup',
      message:
        `Backup database berhasil dibuat:\n\n` +
        `📁 Path: ${backupPath}\n` +
        `📦 Size: ${this.formatFileSize(size)}\n` +
        `⏰ Time: ${new Date().toISOString()}`,
      priority: 'medium',
      timestamp: new Date(),
      metadata: {
        backupPath,
        size,
        timestamp: new Date(),
      },
    };

    await this.send(payload);
  }

  async sendHealthCheckNotification(health: string, details: string): Promise<void> {
    const payload: NotificationPayload = {
      type: NotificationType.HEALTH_CHECK,
      title: '🏥 Health Check',
      message: `System Health: ${health}\n\n${details}`,
      priority: health === 'unhealthy' ? 'high' : 'low',
      timestamp: new Date(),
      metadata: {
        health,
        timestamp: new Date(),
      },
    };

    await this.send(payload);
  }

  async sendScraperErrorNotification(scraperName: string, error: Error): Promise<void> {
    const payload: NotificationPayload = {
      type: NotificationType.SCRAPER_ERROR,
      title: '🔍 Scraper Error',
      message:
        `Scraper ${scraperName} mengalami error:\n\n` +
        `❌ Error: ${error.message}\n` +
        `⏰ Time: ${new Date().toISOString()}`,
      priority: 'medium',
      timestamp: new Date(),
      metadata: {
        scraperName,
        errorMessage: error.message,
        timestamp: new Date(),
      },
    };

    await this.send(payload);
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  private formatFileSize(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    if (mb > 1) {
      return `${mb.toFixed(2)} MB`;
    }
    const kb = bytes / 1024;
    if (kb > 1) {
      return `${kb.toFixed(2)} KB`;
    }
    return `${bytes} bytes`;
  }
}

export const notificationService = NotificationService.getInstance();
