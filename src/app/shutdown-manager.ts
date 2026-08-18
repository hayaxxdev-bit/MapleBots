import { logger } from '../infrastructure/logging/logger';
import { metrics } from '../infrastructure/metrics/metrics';
import { appEvents, AppEvent } from './events';
import { ServiceContainer } from './service-container';
import type { BotInstance } from '../platforms/whatsapp/connection';
import type { ShutdownSignal } from './types';
import { GracefulShutdownError } from './errors';

interface ShutdownOptions {
  readonly timeout?: number;
  readonly forceExitAfterTimeout?: boolean;
}

export class GracefulShutdownManager {
  private shuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: ShutdownOptions = {}) {}

  async shutdown(
    signal: ShutdownSignal,
    bot: BotInstance,
    container: ServiceContainer,
    cleanupCallbacks: Array<() => Promise<void>> = []
  ): Promise<void> {
    if (this.shuttingDown) {
      return this.shutdownPromise ?? Promise.resolve();
    }

    this.shuttingDown = true;
    const startedAt = Date.now();

    logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);
    appEvents.emit(AppEvent.SHUTDOWN_INITIATED, signal);

    this.shutdownPromise = this.performShutdown(bot, container, cleanupCallbacks)
      .then(() => {
        const duration = Date.now() - startedAt;
        metrics.record('shutdown_duration', duration);
        appEvents.emit(AppEvent.SHUTDOWN_COMPLETE, duration);
        logger.info(`👋 Shutdown complete in ${duration}ms.`);
      })
      .catch((error) => {
        appEvents.emit(AppEvent.SHUTDOWN_ERROR, error);
        logger.error(error as Error, 'Graceful shutdown failed.');
        throw error;
      })
      .finally(() => {
        this.shuttingDown = false;
        if (this.timeoutTimer) {
          clearTimeout(this.timeoutTimer);
          this.timeoutTimer = null;
        }
      });

    const timeout = this.options.timeout ?? 15_000;

    if (this.options.forceExitAfterTimeout !== false) {
      this.timeoutTimer = setTimeout(() => {
        // FIX (curly): Menambahkan kurung kurawal pada statement 'if'
        if (!this.shuttingDown) {
          return;
        }

        logger.error('Graceful shutdown timeout exceeded. Forcing exit.');
        process.exit(1);
      }, timeout);
    }

    return this.shutdownPromise;
  }

  private async performShutdown(
    bot: BotInstance,
    container: ServiceContainer,
    cleanupCallbacks: Array<() => Promise<void>>
  ): Promise<void> {
    const tasks: Array<{
      name: string;
      run: () => Promise<void>;
    }> = [
      {
        name: 'WhatsApp connection',
        run: () => bot.stop(),
      },
      {
        name: 'Service container',
        run: () => container.dispose(),
      },
      ...cleanupCallbacks.map((callback, index) => ({
        name: `Cleanup ${index + 1}`,
        run: callback,
      })),
      {
        name: 'Logger flush',
        // FIX (@typescript-eslint/await-thenable): Menghapus await karena logger.flush() sinkron
        run: () => {
          logger.flush();
          return Promise.resolve();
        },
      },
    ];

    for (const task of tasks) {
      const startedAt = Date.now();

      try {
        await Promise.race([
          task.run(),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`${task.name} timed out.`));
            }, 5_000);
          }),
        ]);

        metrics.record('shutdown_task_duration', Date.now() - startedAt, { task: task.name });
      } catch (error) {
        throw new GracefulShutdownError(
          `Shutdown task failed: ${task.name}`,
          task.name,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  setupSignalHandlers(
    bot: BotInstance,
    container: ServiceContainer,
    cleanupCallbacks: Array<() => Promise<void>> = []
  ): void {
    const signals: ShutdownSignal[] = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

    for (const signal of signals) {
      process.once(signal, () => {
        void this.shutdown(signal, bot, container, cleanupCallbacks).catch(() => {
          process.exit(1);
        });
      });
    }
  }
}
