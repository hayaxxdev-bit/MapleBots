// src/infrastructure/health/health-monitor.ts
import { logger } from '../logging/logger';
import { metrics } from '../metrics/metrics';
import { ServiceHealth } from '../../app/types';
import { appEvents, AppEvent } from '../../app/events';

export class HealthMonitor {
  private healthChecks: Map<string, () => Promise<ServiceHealth>> = new Map();
  private healthResults: Map<string, ServiceHealth> = new Map();
  private isChecking = false;

  registerCheck(name: string, checkFn: () => Promise<ServiceHealth>): void {
    this.healthChecks.set(name, checkFn);
    logger.debug(`Health check registered: ${name}`);
  }

  async runAllChecks(): Promise<ServiceHealth[]> {
    if (this.isChecking) {
      logger.warn('Health check already in progress, skipping...');
      return Array.from(this.healthResults.values());
    }

    this.isChecking = true;
    const startTime = Date.now();

    appEvents.emit(AppEvent.HEALTH_CHECK_START);
    logger.info('🏥 Running health checks...');

    const results: ServiceHealth[] = [];

    for (const [name, checkFn] of this.healthChecks) {
      try {
        const result = await checkFn();
        this.healthResults.set(name, result);
        results.push(result);

        // Record metrics
        metrics.record('health_check_duration', result.latency || 0, { service: name });

        if (result.status === 'unhealthy') {
          logger.error({ details: result.details }, `❌ ${name} is unhealthy:`);
          appEvents.emit(AppEvent.HEALTH_CHECK_FAILED, result);
        } else if (result.status === 'degraded') {
          logger.warn({ details: result.details }, `⚠️ ${name} is degraded:`);
        } else {
          logger.debug(`✅ ${name} is healthy (${result.latency}ms)`);
        }
      } catch (error) {
        const failedResult: ServiceHealth = {
          name,
          status: 'unhealthy',
          lastCheck: new Date(),
          details: { error: error instanceof Error ? error.message : String(error) },
        };
        this.healthResults.set(name, failedResult);
        results.push(failedResult);

        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          `❌ ${name} health check failed:`
        );
      }
    }

    const totalDuration = Date.now() - startTime;
    metrics.record('health_check_total_duration', totalDuration);

    appEvents.emit(AppEvent.HEALTH_CHECK_COMPLETE, results, totalDuration);
    this.isChecking = false;

    return results;
  }

  getHealth(name: string): ServiceHealth | undefined {
    return this.healthResults.get(name);
  }

  getAllHealth(): ServiceHealth[] {
    return Array.from(this.healthResults.values());
  }

  getSystemHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const results = this.getAllHealth();
    if (results.length === 0) {
      return 'healthy';
    }

    if (results.some((r) => r.status === 'unhealthy')) {
      return 'unhealthy';
    }

    if (results.some((r) => r.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }
}

export const healthMonitor = new HealthMonitor();
