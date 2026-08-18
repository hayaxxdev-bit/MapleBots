// src/core/events.ts
import { EventEmitter } from 'events';
import { logger } from '../infrastructure/logging/logger';

export enum AppEvent {
  BOOTSTRAP_START = 'bootstrap:start',
  BOOTSTRAP_COMPLETE = 'bootstrap:complete',
  BOOTSTRAP_ERROR = 'bootstrap:error',
  SERVICES_INITIALIZED = 'services:initialized',
  HEALTH_CHECK_START = 'health:check:start',
  HEALTH_CHECK_COMPLETE = 'health:check:complete',
  HEALTH_CHECK_FAILED = 'health:check:failed',
  SHUTDOWN_INITIATED = 'shutdown:initiated',
  SHUTDOWN_COMPLETE = 'shutdown:complete',
  SHUTDOWN_ERROR = 'shutdown:error',
  DNS_TEST_COMPLETE = 'dns:test:complete',
  TEMP_CLEANUP_COMPLETE = 'temp:cleanup:complete',
  METRICS_UPDATED = 'metrics:updated',
}

type EventListener = (...args: unknown[]) => unknown;

export class AppEventEmitter extends EventEmitter {
  private static instance: AppEventEmitter;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): AppEventEmitter {
    if (!AppEventEmitter.instance) {
      AppEventEmitter.instance = new AppEventEmitter();
    }
    return AppEventEmitter.instance;
  }

  async emitAsync(event: AppEvent, ...args: unknown[]): Promise<void> {
    this.emit(event, ...args);

    // FIX: Type assertion menggunakan signature fungsi yang spesifik, bukan 'Function'
    const listeners = this.listeners(event) as EventListener[];
    const promises = listeners.map((listener) => {
      const result: unknown = listener(...args);
      return result instanceof Promise ? result : Promise.resolve();
    });

    await Promise.all(promises);
  }
}

export const appEvents = AppEventEmitter.getInstance();

// Setup event logging
Object.values(AppEvent).forEach((event) => {
  appEvents.on(event, (...args: unknown[]) => {
    logger.debug({ args }, `Event emitted: ${event}`);
  });
});
