import express, { type Express } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'node:path';

import { config } from '../../config/config';
import { logger } from '../../infrastructure/logging/logger';
import { metricsTracker } from './metrics-tracker';
import { runHealthCheck, type ServiceHealth } from './health-checker';
import { getPublicConfigSnapshot } from './dashboard-config';
import { notificationService } from '../../infrastructure/notification/notification-service';
import { getApiRegistrySnapshot } from '../../infrastructure/api/api-health';

export class WebDashboard {
  private app: Express | null = null;
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;

  private updateInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;

  private cachedHealth: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    timestamp: string;
  } = {
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
      },
    });

    this.app.use(express.json());

    this.app.use(express.static(path.resolve(process.cwd(), 'public')));

    this.routes();
    this.sockets();
    this.intervals();

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once('error', reject);

      this.httpServer!.listen(port, () => {
        resolve();
      });
    });

    logger.info(`📊 Dashboard tersedia di http://localhost:${port}`);
  }

  private routes(): void {
    const app = this.app!;

    app.get('/health/live', (_q, res) => {
      res.json({
        ok: true,
        status: 'ok',
      });
    });

    app.get('/api/system', (_q, res) => {
      res.json(metricsTracker.getSystemInfo());
    });

    app.get('/api/bot', (_q, res) => {
      res.json(metricsTracker.getBotStatus());
    });

    app.get('/api/metrics', (_q, res) => {
      res.json(metricsTracker.getSummary());
    });

    app.get('/api/health', async (_q, res) => {
      const health = await runHealthCheck();

      this.cachedHealth = health;

      res.json(health);
    });

    app.get('/api/apis', async (_q, res) => {
      try {
        const snapshot = await getApiRegistrySnapshot();

        res.json({
          ok: true,
          ...snapshot,
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

    app.get('/api/notifications', (_q, res) => {
      res.json(
        notificationService
          .getHistory()
          .slice(-100)
          .reverse()
          .map((item) => ({
            ...item,
            timestamp: item.timestamp.getTime(),
          }))
      );
    });

    app.get('/api/config', (_q, res) => {
      res.json(getPublicConfigSnapshot());
    });

    app.get('/api/status', (_q, res) => {
      res.json({
        ok: true,
        bot: metricsTracker.getBotStatus(),
        system: metricsTracker.getSystemInfo(),
        health: this.cachedHealth,
        metrics: metricsTracker.getSummary(),
        config: getPublicConfigSnapshot(),
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
    this.updateInterval = setInterval(() => {
      if (!this.io) {
        return;
      }

      this.io.emit('system-update', metricsTracker.getSystemInfo());

      this.io.emit('bot-update', metricsTracker.getBotStatus());

      this.io.emit('metrics-update', metricsTracker.getSummary());
    }, 2000);

    this.healthInterval = setInterval(() => {
      void runHealthCheck().then((health) => {
        this.cachedHealth = health;

        this.io?.emit('health-update', health);
      });
    }, 30000);

    void runHealthCheck().then((health) => {
      this.cachedHealth = health;
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
