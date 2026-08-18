import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');
import { ApplicationBootstrap } from './app/bootstrap';
import { config } from './config/config';
import { globalErrorHandler } from './app/error-handler';
import { notificationService } from './infrastructure/notification/notification-service';
import { logger } from './infrastructure/logging/logger';

const bootstrap = new ApplicationBootstrap({
  enableHealthChecks: true,
  enableMetrics: true,
  gracefulShutdownTimeout: 15_000,
});

function setupGlobalErrorHandling(): void {
  globalErrorHandler.setup();

  globalErrorHandler.setNotificationHandler(async (error) => {
    if (!config.notifyOnCrash) {
      return;
    }

    try {
      await notificationService.sendCrashNotification(error);
    } catch (notificationError) {
      const err =
        notificationError instanceof Error
          ? notificationError
          : new Error(String(notificationError));

      logger.error(err, 'Crash notification failed.');
    }
  });
}

async function main(): Promise<void> {
  try {
    setupGlobalErrorHandling();

    await bootstrap.initialize();

    logger.info('🎉 Application started successfully.');
    logger.info(`📊 Dashboard: http://localhost:${config.webDashboardPort}`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.fatal(err, 'Failed to start Maple Bots.');

    if (config.notifyOnCrash) {
      try {
        await notificationService.sendCrashNotification(err);
      } catch (notificationError) {
        const notifyError =
          notificationError instanceof Error
            ? notificationError
            : new Error(String(notificationError));

        logger.error(notifyError, 'Failed to send crash notification.');
      }
    }

    process.exitCode = 1;
  }
}

void main();

export { bootstrap };
