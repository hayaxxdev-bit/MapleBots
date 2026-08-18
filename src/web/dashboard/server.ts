import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'node:path';

import { logger } from '../../infrastructure/logging/logger';
import { metricsTracker } from './metrics-tracker';
import { runHealthCheck, type ServiceHealth } from './health-checker';
import { getPublicConfigSnapshot } from './dashboard-config';
import { notificationService } from '../../infrastructure/notification/notification-service';
import { getApiRegistrySnapshot } from '../../infrastructure/api/api-health';

interface CachedHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  timestamp: string;
}

export class WebDashboard {
  private app: Express | null = null;
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;

  private updateInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;

  private cachedHealth: CachedHealth = {
    status: 'degraded',
    services: [],
    timestamp: new Date().toISOString(),
  };

  async start(port = Number(process.env['WEB_DASHBOARD_PORT'] ?? 3000)): Promise<void> {
    if (this.httpServer) {
      return;
    }

    this.app = express();

    this.httpServer = createServer(this.app);

    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.app.disable('x-powered-by');

    this.app.use(express.json());

    this.app.use(express.static(path.resolve(process.cwd(), 'public')));

    this.routes();
    this.sockets();
    this.intervals();

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);

      this.httpServer!.listen(port, '0.0.0.0', () => {
        resolve();
      });
    });

    logger.info(`📊 Dashboard tersedia di port ${port}.`);
  }

  private getTelemetrySnapshot() {
    const system = metricsTracker.getSystemInfo();
    const bot = metricsTracker.getBotStatus();
    const metrics = metricsTracker.getSummary();
    const config = getPublicConfigSnapshot();

    return {
      ok: true,
      timestamp: new Date().toISOString(),

      environment: config.environment,

      system,
      bot,
      metrics,

      health: this.cachedHealth,

      config,
    };
  }

  private routes(): void {
    const app = this.app!;

    /*
     * Liveness
     */
    app.get('/health/live', (_req, res) => {
      res.json({
        ok: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    });

    /*
     * Unified telemetry endpoint.
     *
     * Frontend dashboard sebaiknya menggunakan endpoint ini
     * sebagai sumber utama data realtime/polling.
     */
    app.get('/api/telemetry', (_req, res) => {
      res.json(this.getTelemetrySnapshot());
    });

    /*
     * Backward-compatible status endpoint.
     */
    app.get('/api/status', (_req, res) => {
      res.json(this.getTelemetrySnapshot());
    });

    /*
     * Individual endpoints.
     */
    app.get('/api/system', (_req, res) => {
      res.json({
        ok: true,
        ...metricsTracker.getSystemInfo(),
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/api/bot', (_req, res) => {
      res.json({
        ok: true,
        ...metricsTracker.getBotStatus(),
        timestamp: new Date().toISOString(),
      });
    });

    app.get('/api/metrics', (_req, res) => {
      res.json({
        ok: true,
        ...metricsTracker.getSummary(),
        timestamp: new Date().toISOString(),
      });
    });

    /*
     * Health
     */
    app.get('/api/health', async (_req, res) => {
      try {
        const health = await runHealthCheck();

        this.cachedHealth = health;

        res.json({
          ok: true,
          ...health,
        });
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          'Failed to run health check.'
        );

        res.status(500).json({
          ok: false,
          status: 'unhealthy',
          services: [],
          error: 'Failed to run health check.',
          timestamp: new Date().toISOString(),
        });
      }
    });

    /*
     * API providers
     */
    app.get('/api/apis', async (_req, res) => {
      try {
        const snapshot = await getApiRegistrySnapshot();

        res.json({
          ok: true,
          ...snapshot,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          'Failed to get API registry snapshot.'
        );

        res.status(500).json({
          ok: false,
          error: 'Failed to get API registry snapshot.',
          timestamp: new Date().toISOString(),
        });
      }
    });

    /*
     * Notifications
     */
    app.get('/api/notifications', (_req, res) => {
      const notifications = notificationService
        .getHistory()
        .slice(-100)
        .reverse()
        .map((item) => ({
          ...item,
          timestamp:
            item.timestamp instanceof Date
              ? item.timestamp.getTime()
              : new Date(item.timestamp).getTime(),
        }));

      res.json({
        ok: true,
        notifications,
        count: notifications.length,
        timestamp: new Date().toISOString(),
      });
    });

    /*
     * Public configuration.
     */
    app.get('/api/config', (_req, res) => {
      res.json({
        ok: true,
        ...getPublicConfigSnapshot(),
        timestamp: new Date().toISOString(),
      });
    });
  }

  private sockets(): void {
    this.io!.on('connection', (socket) => {
      logger.info(
        {
          socketId: socket.id,
        },
        '📊 Dashboard client connected.'
      );

      /*
       * Send complete state immediately.
       */
      socket.emit('telemetry', this.getTelemetrySnapshot());

      /*
       * Backward compatibility with existing frontend.
       */
      socket.emit('initial-data', {
        system: metricsTracker.getSystemInfo(),
        bot: metricsTracker.getBotStatus(),
        health: this.cachedHealth,
        metrics: metricsTracker.getSummary(),
        config: getPublicConfigSnapshot(),
      });

      socket.on('disconnect', () => {
        logger.debug(
          {
            socketId: socket.id,
          },
          'Dashboard client disconnected.'
        );
      });
    });
  }

  private intervals(): void {
    /*
     * Realtime telemetry.
     */
    this.updateInterval = setInterval(() => {
      if (!this.io) {
        return;
      }

      const telemetry = this.getTelemetrySnapshot();

      /*
       * New unified event.
       */
      this.io.emit('telemetry', telemetry);

      /*
       * Existing events kept for compatibility.
       */
      this.io.emit('system-update', telemetry.system);
      this.io.emit('bot-update', telemetry.bot);
      this.io.emit('metrics-update', telemetry.metrics);
    }, 2000);

    /*
     * Health check.
     */
    this.healthInterval = setInterval(() => {
      void runHealthCheck()
        .then((health) => {
          this.cachedHealth = health;

          this.io?.emit('health-update', health);
        })
        .catch((error) => {
          logger.error(
            error instanceof Error ? error : new Error(String(error)),
            'Dashboard health check failed.'
          );
        });
    }, 30_000);

    /*
     * Initial health check.
     */
    void runHealthCheck()
      .then((health) => {
        this.cachedHealth = health;
      })
      .catch((error) => {
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          'Initial dashboard health check failed.'
        );
      });
  }

  async stop(): Promise<void> {
    if (!this.httpServer) {
      return;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }

    this.io?.close();

    await new Promise<void>((resolve) => {
      this.httpServer!.close(() => {
        resolve();
      });
    });

    this.io = null;
    this.httpServer = null;
    this.app = null;

    logger.info('Web dashboard stopped.');
  }
}

export const webDashboard = new WebDashboard();

export async function startDashboard(): Promise<void> {
  await webDashboard.start();
}