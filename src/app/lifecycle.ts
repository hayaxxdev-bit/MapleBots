import { logger } from '../infrastructure/logging/logger';

/**
 * Application lifecycle hooks that are intentionally small.
 * Platform-specific connection handling lives in platforms/whatsapp.
 */
export class LifecycleManager {
  private static instance: LifecycleManager;
  private startedAt = Date.now();

  private constructor() {}

  static getInstance(): LifecycleManager {
    if (!LifecycleManager.instance) {
      LifecycleManager.instance = new LifecycleManager();
    }
    return LifecycleManager.instance;
  }

  initialize(): void {
    this.startedAt = Date.now();
    logger.debug('Application lifecycle initialized.');
  }

  getUptime(): number {
    return Date.now() - this.startedAt;
  }

  shutdown(): Promise<void> {
    logger.debug('Application lifecycle shutdown.');
    return Promise.resolve();
  }
}

export const lifecycleManager = LifecycleManager.getInstance();
