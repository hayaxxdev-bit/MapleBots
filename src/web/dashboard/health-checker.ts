import { config } from '../../config/config';
import { logger } from '../../infrastructure/logging/logger';
import { notificationService } from '../../infrastructure/notification/notification-service';
import { getWhatsAppRuntime } from './runtime-state';

import {
  checkAllApiHealth,
} from '../../infrastructure/api/api-health';

export type HealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unhealthy';

export interface ServiceHealth {
  name: string;
  status: HealthStatus;
  message: string;
  latency: number | null;
}

export interface HealthReport {
  status: HealthStatus;
  services: ServiceHealth[];
  timestamp: string;
}

function elapsed(start: number): number {
  return Math.max(0, Date.now() - start);
}

function getOverallStatus(
  services: ServiceHealth[],
): HealthStatus {
  if (
    services.some(
      (service) => service.status === 'unhealthy',
    )
  ) {
    return 'unhealthy';
  }

  if (
    services.some(
      (service) => service.status === 'degraded',
    )
  ) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Check WhatsApp runtime state.
 */
function checkWhatsApp(): ServiceHealth {
  const start = Date.now();
  const runtime = getWhatsAppRuntime();

  if (
    runtime.connected &&
    runtime.connection === 'open'
  ) {
    return {
      name: 'WhatsApp',
      status: 'healthy',
      message: 'WhatsApp connection is active.',
      latency: elapsed(start),
    };
  }

  if (
    runtime.connection === 'connecting'
  ) {
    return {
      name: 'WhatsApp',
      status: 'degraded',
      message: 'WhatsApp is connecting.',
      latency: elapsed(start),
    };
  }

  return {
    name: 'WhatsApp',
    status: 'unhealthy',
    message: 'WhatsApp connection is not active.',
    latency: elapsed(start),
  };
}

/**
 * Notification service health.
 */
function checkNotification(): ServiceHealth {
  const start = Date.now();

  try {
    const history =
      notificationService.getHistory();

    return {
      name: 'Notification',
      status: 'healthy',
      message:
        `Notification service is active. ` +
        `${history.length} notification(s) recorded.`,
      latency: elapsed(start),
    };
  } catch (error) {
    logger.error(
      error instanceof Error
        ? error
        : new Error(String(error)),
      'Notification health check failed.',
    );

    return {
      name: 'Notification',
      status: 'unhealthy',
      message:
        'Notification service is unavailable.',
      latency: elapsed(start),
    };
  }
}

/**
 * Node.js runtime health.
 */
function checkNode(): ServiceHealth {
  const start = Date.now();

  return {
    name: 'Node.js',
    status: 'healthy',
    message: `Running ${process.version}.`,
    latency: elapsed(start),
  };
}

/**
 * Convert API registry health results
 * into dashboard service health entries.
 */
async function checkApiServices(): Promise<ServiceHealth[]> {
  try {
    const results = await checkAllApiHealth();

    return results.map((result) => {
      const health = result.health;

      let status: HealthStatus;

      switch (health.status) {
        case 'healthy':
          status = 'healthy';
          break;

        case 'degraded':
          status = 'degraded';
          break;

        case 'unhealthy':
          status = 'unhealthy';
          break;

        case 'disabled':
        case 'unknown':
        default:
          status = 'degraded';
          break;
      }

      return {
        name: result.name,
        status,
        message:
          health.message ??
          (
            health.status === 'healthy'
              ? `${result.name} is reachable.`
              : `${result.name} is ${health.status}.`
          ),
        latency:
          health.latencyMs ?? null,
      };
    });
  } catch (error) {
    logger.error(
      error instanceof Error
        ? error
        : new Error(String(error)),
      'API services health check failed.',
    );

    return [
      {
        name: 'API Registry',
        status: 'unhealthy',
        message: 'API registry health check failed.',
        latency: null,
      },
    ];
  }
}

/**
 * Complete application health check.
 */
export async function runHealthCheck(): Promise<HealthReport> {
  const services: ServiceHealth[] = [
    checkWhatsApp(),
    checkNotification(),
    checkNode(),
  ];

  /**
   * API providers are discovered dynamically
   * from the API registry.
   *
   * This means adding:
   *
   *   jikan
   *   waifu-im
   *   trace-moe
   *   ...
   *
   * automatically makes them appear here.
   */
  const apiServices = await checkApiServices();

  services.push(...apiServices);

  return {
    status: getOverallStatus(services),
    services,
    timestamp: new Date().toISOString(),
  };
}