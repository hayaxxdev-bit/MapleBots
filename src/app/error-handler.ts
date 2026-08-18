// src/core/error-handler.ts
import { logger } from '../infrastructure/logging/logger';
import { metrics } from '../infrastructure/metrics/metrics';
import { appEvents, AppEvent } from './events';
import { config } from '../config/config';

type NotificationHandler = (error: Error) => Promise<void>;

export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private errorCount = 0;
  private readonly maxErrorsBeforeExit = 10;
  private readonly errorWindowMs = 60000; // 1 minute
  private errorTimestamps: number[] = [];
  private notificationHandler?: NotificationHandler;

  private constructor() {}

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler();
    }
    return GlobalErrorHandler.instance;
  }

  setup(): void {
    this.handleUnhandledRejections();
    this.handleUncaughtExceptions();
    this.handleWarnings();
    this.handleProcessExit();
  }

  setNotificationHandler(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  private handleUnhandledRejections(): void {
    process.on('unhandledRejection', (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));

      this.recordError('unhandledRejection');
      // ✅ Fixed Pino argument order
      logger.error(error, 'Unhandled promise rejection:');
      metrics.record('unhandled_rejection', 1);

      appEvents.emit(AppEvent.BOOTSTRAP_ERROR, error);

      // Optionally notify if too many errors
      this.checkErrorThreshold();
    });
  }

  private handleUncaughtExceptions(): void {
    process.on('uncaughtException', (error: Error) => {
      this.recordError('uncaughtException');
      // ✅ Fixed Pino argument order
      logger.fatal(error, 'Uncaught exception detected:');
      metrics.record('uncaught_exception', 1);

      // Notify owner if enabled
      if (config.notifyOnCrash) {
        this.notifyCrash(error);
      }

      // Graceful shutdown after delay to allow logging
      setTimeout(() => {
        logger.error('Exiting due to uncaught exception...');
        process.exit(1);
      }, 1000);
    });
  }

  private handleWarnings(): void {
    process.on('warning', (warning: Error) => {
      // ✅ Fixed Pino argument order
      logger.warn(warning, 'Node.js warning:');
      metrics.record('node_warning', 1);
    });
  }

  private handleProcessExit(): void {
    process.on('exit', (code) => {
      const summary = metrics.getSummary();
      // ✅ Fixed Pino argument order
      logger.info({ code, metrics: summary }, 'Process exiting:');
    });
  }

  private recordError(_type: string): void {
    this.errorCount++;
    this.errorTimestamps.push(Date.now());

    // Clean old timestamps
    const cutoff = Date.now() - this.errorWindowMs;
    this.errorTimestamps = this.errorTimestamps.filter((t) => t > cutoff);
  }

  private checkErrorThreshold(): void {
    if (this.errorTimestamps.length >= this.maxErrorsBeforeExit) {
      logger.fatal(
        `Too many errors (${this.errorTimestamps.length}) in the last minute. Exiting...`
      );
      process.exit(1);
    }
  }

  private notifyCrash(error: Error): void {
    if (this.notificationHandler) {
      this.notificationHandler(error).catch((err) => {
        logger.error(err, 'Failed to send crash notification handler:');
      });
    } else {
      logger.debug('Sending crash notification...');
    }
  }
}

export const globalErrorHandler = GlobalErrorHandler.getInstance();
