import dns from 'node:dns';

import { config } from '../config/config';
import { logger } from '../infrastructure/logging/logger';

import { CacheManager } from '../infrastructure/cache/cache';
import { DatabaseManager } from '../infrastructure/database/database';
import { ScraperManager } from '../infrastructure/scraper/scraper-manager';
import { browserManager } from '../infrastructure/browser/browser-manager';
import { metrics } from '../infrastructure/metrics/metrics';
import { healthMonitor } from '../infrastructure/health/health-monitor';
import { tempFileManager } from '../infrastructure/storage/temp-file-manager';
import { RateLimiter } from '../infrastructure/rate-limit/rate-limiter';

import { notificationService } from '../infrastructure/notification/notification-service';
import { WhatsAppNotificationChannel } from '../infrastructure/notification/whatsapp-channel';

import { webDashboard } from '../web/dashboard/server';

import { startBot, type BotInstance } from '../platforms/whatsapp/connection';

import { appEvents, AppEvent } from './events';
import { ServiceContainer } from './service-container';

import type { AppServices, BootstrapOptions } from './types';

import { BotInitializationError } from './errors';
import { GracefulShutdownManager } from './shutdown-manager';

import { setDashboardBot } from '@/web/dashboard/runtime-state';

import { registerBuiltinApiProviders } from '../infrastructure/api/providers';
import { registerApiProviders } from '../infrastructure/api/api-bootstrap';

export class ApplicationBootstrap {
  private readonly container = new ServiceContainer();

  private readonly shutdownManager: GracefulShutdownManager;

  private readonly whatsappNotificationChannel: WhatsAppNotificationChannel;

  private services!: AppServices;

  private botInstance: BotInstance | null = null;

  private startedAt = 0;

  private healthInterval: NodeJS.Timeout | null = null;

  private scraperHealthInterval: NodeJS.Timeout | null = null;

  private tempCleanupInterval: NodeJS.Timeout | null = null;

  private dashboardStarted = false;

  private shuttingDown = false;

  private botOnlineNotified = false;

  constructor(private readonly options: BootstrapOptions = {}) {
    dns.setDefaultResultOrder('ipv4first');

    this.shutdownManager = new GracefulShutdownManager({
      timeout: options.gracefulShutdownTimeout ?? 15_000,
    });

    /*
     * IMPORTANT
     *
     * Notification channel tidak menyimpan socket secara permanen.
     *
     * Reconnect Baileys dapat membuat socket baru.
     *
     * Karena itu channel mengambil socket terbaru
     * melalui getter.
     */
    this.whatsappNotificationChannel = new WhatsAppNotificationChannel(
      () => this.botInstance?.sock
    );

    notificationService.registerChannel(this.whatsappNotificationChannel);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  async initialize(): Promise<ApplicationBootstrap> {
    this.startedAt = Date.now();

    appEvents.emit(AppEvent.BOOTSTRAP_START);
    registerBuiltinApiProviders();
    registerApiProviders();

    try {
      // --------------------------------------------------------
      // Metrics
      // --------------------------------------------------------

      metrics.start();

      // --------------------------------------------------------
      // Configuration
      // --------------------------------------------------------

      this.logConfiguration();

      // --------------------------------------------------------
      // Services
      // --------------------------------------------------------

      this.registerServices();

      await this.initializeServices();

      // --------------------------------------------------------
      // Health checks
      // --------------------------------------------------------

      this.setupHealthChecks();

      // --------------------------------------------------------
      // Background tasks
      // --------------------------------------------------------

      this.startBackgroundTasks();

      // --------------------------------------------------------
      // WhatsApp
      // --------------------------------------------------------

      await this.startBot();

      // --------------------------------------------------------
      // Dashboard
      // --------------------------------------------------------

      await this.startDashboard();

      // --------------------------------------------------------
      // Shutdown
      // --------------------------------------------------------

      this.registerShutdownHandlers();

      // --------------------------------------------------------
      // Bootstrap completed
      // --------------------------------------------------------

      const duration = Date.now() - this.startedAt;

      metrics.record('bootstrap_duration', duration);

      appEvents.emit(AppEvent.BOOTSTRAP_COMPLETE, duration);

      logger.info(`✅ Maple Bots ready in ${duration}ms.`);

      /*
       * IMPORTANT:
       *
       * Jangan kirim BOT_ONLINE di sini.
       *
       * startBot() hanya membuat socket.
       *
       * BOT_ONLINE dikirim ketika connection.update
       * benar-benar memberikan connection === "open".
       */

      return this;
    } catch (error) {
      const wrapped = new BotInitializationError(
        'Failed to bootstrap Maple Bots',
        'bootstrap',
        error instanceof Error ? error : new Error(String(error))
      );

      appEvents.emit(AppEvent.BOOTSTRAP_ERROR, wrapped);

      logger.fatal(wrapped, 'Bootstrap failed.');

      throw wrapped;
    }
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================

  private logConfiguration(): void {
    logger.info(`Environment: ${config.isProduction ? 'production' : 'development'}`);

    logger.info(`Bot: ${config.botName}`);

    logger.info(`Prefix: ${config.prefix}`);

    logger.info(`Mode: ${config.botMode}`);

    logger.info(`Database: ${config.databaseType}`);

    logger.info(`Cache: ${config.cacheType}`);
  }

  // ============================================================
  // SERVICE REGISTRATION
  // ============================================================

  private registerServices(): void {
    this.container.register('cache', () => CacheManager.getInstance());

    this.container.register('database', async () => {
      const database = DatabaseManager.getInstance();

      await database.initialize();

      return database;
    });

    this.container.register('scraperManager', async () => {
      const scraper = ScraperManager.getInstance();

      await scraper.initialize();

      return scraper;
    });
  }

  // ============================================================
  // SERVICE INITIALIZATION
  // ============================================================

  private async initializeServices(): Promise<void> {
    await this.container.initialize();

    const cache = await this.container.resolve<CacheManager>('cache');

    const database = await this.container.resolve<DatabaseManager>('database');

    const scraperManager = await this.container.resolve<ScraperManager>('scraperManager');

    this.services = {
      cache,
      database,
      scraperManager,
    };

    appEvents.emit(AppEvent.SERVICES_INITIALIZED);

    logger.info('✅ Application services initialized.');
  }

  // ============================================================
  // HEALTH CHECKS
  // ============================================================

  private setupHealthChecks(): void {
    if (this.options.enableHealthChecks === false) {
      return;
    }

    // ----------------------------------------------------------
    // Cache
    // ----------------------------------------------------------

    healthMonitor.registerCheck('cache', () => {
      const start = Date.now();

      try {
        const key = '__health_check__';

        this.services.cache.set(key, 'ok', 1000);

        const healthy = this.services.cache.get<string>(key) === 'ok';

        return Promise.resolve({
          name: 'cache',
          status: healthy ? 'healthy' : 'unhealthy',
          latency: Date.now() - start,
          lastCheck: new Date(),
        });
      } catch (error) {
        return Promise.resolve({
          name: 'cache',
          status: 'unhealthy',
          latency: Date.now() - start,
          lastCheck: new Date(),
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    // ----------------------------------------------------------
    // Database
    // ----------------------------------------------------------

    healthMonitor.registerCheck('database', async () => {
      const start = Date.now();

      try {
        const healthy = await this.services.database.ping();

        return {
          name: 'database',
          status: healthy ? 'healthy' : 'unhealthy',
          latency: Date.now() - start,
          lastCheck: new Date(),
        };
      } catch (error) {
        return {
          name: 'database',
          status: 'unhealthy',
          latency: Date.now() - start,
          lastCheck: new Date(),
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });

    // ----------------------------------------------------------
    // Scrapers
    // ----------------------------------------------------------

    healthMonitor.registerCheck('scrapers', async () => {
      const start = Date.now();

      try {
        const results = await this.services.scraperManager.healthCheck();

        const unhealthy = results.some((result) => result.status === 'unhealthy');

        const degraded = results.some((result) => result.status === 'degraded');

        return {
          name: 'scrapers',
          status: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
          latency: Date.now() - start,
          lastCheck: new Date(),
        };
      } catch (error) {
        return {
          name: 'scrapers',
          status: 'degraded',
          latency: Date.now() - start,
          lastCheck: new Date(),
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    });

    void healthMonitor.runAllChecks();
  }

  // ============================================================
  // WHATSAPP BOT
  // ============================================================

  private async startBot(): Promise<void> {
    const start = Date.now();

    this.botInstance = await startBot();

    /*
     * Dashboard memakai instance yang sama.
     *
     * Tidak membuat socket kedua.
     */
    setDashboardBot(this.botInstance);

    metrics.record('bot_start_duration', Date.now() - start);

    logger.info('🤖 WhatsApp bot started.');

    /*
     * IMPORTANT
     *
     * Jangan kirim BOT_ONLINE di sini.
     *
     * Socket baru dibuat.
     *
     * Tunggu connection.update:
     *
     * connection === "open"
     *
     * Notification online akan dikirim
     * dari lifecycle WhatsApp tersebut.
     */
  }

  // ============================================================
  // DASHBOARD
  // ============================================================

  private async startDashboard(): Promise<void> {
    if (!config.webDashboardEnabled) {
      return;
    }

    try {
      const port = config.webDashboardPort;

      await webDashboard.start(port);

      this.dashboardStarted = true;
    } catch (error) {
      logger.warn(error as Error, 'Dashboard failed to start; continuing without dashboard.');
    }
  }

  // ============================================================
  // BACKGROUND TASKS
  // ============================================================

  private startBackgroundTasks(): void {
    // ----------------------------------------------------------
    // Temporary files cleanup
    // ----------------------------------------------------------

    if (config.tempCleanupInterval > 0) {
      this.tempCleanupInterval = setInterval(() => {
        void tempFileManager.cleanup(config.tempDir, config.tempCleanupInterval).catch((error) => {
          logger.warn(error as Error, 'Temporary file cleanup failed.');
        });
      }, config.tempCleanupInterval * 60_000);
    }

    // ----------------------------------------------------------
    // Scraper health
    // ----------------------------------------------------------

    if (config.scraperHealthCheck && config.scraperCheckInterval > 0) {
      this.scraperHealthInterval = setInterval(() => {
        void this.services.scraperManager.healthCheck().catch((error) => {
          logger.warn(error as Error, 'Scheduled scraper health check failed.');
        });
      }, config.scraperCheckInterval);
    }

    // ----------------------------------------------------------
    // Application health
    // ----------------------------------------------------------

    if (this.options.enableHealthChecks !== false) {
      this.healthInterval = setInterval(() => {
        void healthMonitor.runAllChecks();
      }, 60_000);
    }
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  private createCleanupCallbacks(): Array<() => Promise<void>> {
    return [
      // --------------------------------------------------------
      // Timers
      // --------------------------------------------------------

      () => {
        if (this.tempCleanupInterval) {
          clearInterval(this.tempCleanupInterval);

          this.tempCleanupInterval = null;
        }

        if (this.scraperHealthInterval) {
          clearInterval(this.scraperHealthInterval);

          this.scraperHealthInterval = null;
        }

        if (this.healthInterval) {
          clearInterval(this.healthInterval);

          this.healthInterval = null;
        }

        return Promise.resolve();
      },

      // --------------------------------------------------------
      // Rate limiter
      // --------------------------------------------------------

      () => {
        RateLimiter.getInstance().destroy();

        return Promise.resolve();
      },

      // --------------------------------------------------------
      // Browser
      // --------------------------------------------------------

      async () => {
        await browserManager.close();
      },

      // --------------------------------------------------------
      // Dashboard
      // --------------------------------------------------------

      async () => {
        if (this.dashboardStarted) {
          await webDashboard.stop();

          this.dashboardStarted = false;
        }
      },

      // --------------------------------------------------------
      // Metrics
      // --------------------------------------------------------

      () => {
        metrics.stop();

        return Promise.resolve();
      },

      // --------------------------------------------------------
      // Notification
      // --------------------------------------------------------

      () => {
        notificationService.dispose();

        return Promise.resolve();
      },
    ];
  }

  // ============================================================
  // SHUTDOWN
  // ============================================================

  private registerShutdownHandlers(): void {
    if (!this.botInstance) {
      return;
    }

    this.shutdownManager.setupSignalHandlers(
      this.botInstance,
      this.container,
      this.createCleanupCallbacks()
    );
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;

    if (!this.botInstance) {
      return;
    }

    /*
     * IMPORTANT
     *
     * Offline notification HARUS dikirim
     * sebelum WhatsApp socket ditutup.
     */
    if (config.notifyOnStop) {
      try {
        await notificationService.sendBotOfflineNotification('SIGTERM', this.getUptime());
      } catch (error) {
        logger.warn(error as Error, 'Failed to send bot offline notification.');
      }
    }

    await this.shutdownManager.shutdown(
      'SIGTERM',
      this.botInstance,
      this.container,
      this.createCleanupCallbacks()
    );

    setDashboardBot(null);

    this.botInstance = null;
  }

  // ============================================================
  // GETTERS
  // ============================================================

  getBotInstance(): BotInstance | null {
    return this.botInstance;
  }

  getBotSocket(): BotInstance['sock'] | null {
    return this.botInstance?.sock ?? null;
  }

  getServices(): AppServices {
    return this.services;
  }

  getBotStats(): ReturnType<BotInstance['getStats']> | null {
    return this.botInstance?.getStats() ?? null;
  }

  getUptime(): number {
    return this.startedAt > 0 ? Date.now() - this.startedAt : 0;
  }

  getUptimeFormatted(): string {
    const seconds = Math.floor(this.getUptime() / 1_000);

    const minutes = Math.floor(seconds / 60);

    const hours = Math.floor(minutes / 60);

    const days = Math.floor(hours / 24);

    const parts: string[] = [];

    if (days) {
      parts.push(`${days}d`);
    }

    if (hours) {
      parts.push(`${hours % 24}h`);
    }

    if (minutes) {
      parts.push(`${minutes % 60}m`);
    }

    parts.push(`${seconds % 60}s`);

    return parts.join(' ');
  }
}
