import os from 'node:os';

import type { BotInstance } from '../../platforms/whatsapp/connection';
import { botStats } from '../../platforms/whatsapp/connection';

import { notificationService } from '../../infrastructure/notification/notification-service';
import { logger } from '@/utils/logger';

// ============================================================
// TYPES
// ============================================================

export type DashboardConnectionState = 'connecting' | 'open' | 'close';

export interface DashboardBotStatus {
  connected: boolean;
  connection: DashboardConnectionState;

  messagesProcessed: number;
  commandsExecuted: number;
  errors: number;

  reconnectAttempts: number;

  connectedAt: string | null;

  uptime: number;
  uptimeFormatted: string;

  messagesPerMinute: number;
  errorRate: number;

  user: {
    id: string | null;
    name: string | null;
  };
}

export interface DashboardSystemStatus {
  platform: string;
  arch: string;
  hostname: string;

  cpu: {
    cores: number;
    usage: number;
    usagePercent: number;

    loadAverage: {
      oneMinute: number;
      fiveMinutes: number;
      fifteenMinutes: number;
    };
  };

  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;

    totalMB: number;
    usedMB: number;
    freeMB: number;

    totalGB: number;
    usedGB: number;
    freeGB: number;
  };

  node: {
    version: string;
    uptime: number;
    uptimeFormatted: string;
  };

  process: {
    pid: number;
    uptime: number;
    uptimeFormatted: string;

    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;

      rssMB: number;
      heapUsedMB: number;
      heapTotalMB: number;
    };
  };
}

export interface DashboardHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';

  services: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    message?: string;
  }>;

  timestamp: string;
}

export interface DashboardMetrics {
  messagesProcessed: number;
  commandsExecuted: number;
  errors: number;

  errorRate: number;
  messagesPerMinute: number;

  reconnectAttempts: number;

  notificationCount: number;
}

// ============================================================
// WHATSAPP RUNTIME STATE
// ============================================================

export interface WhatsAppRuntimeState {
  connected: boolean;

  connection: 'open' | 'connecting' | 'close' | 'unknown';

  connectedAt: string | null;

  user: {
    id: string | null;
    name: string | null;
  };

  reconnectAttempts: number;

  lastDisconnectCode: number | null;
}

const whatsappState: WhatsAppRuntimeState = {
  connected: false,

  connection: 'unknown',

  connectedAt: null,

  user: {
    id: null,
    name: null,
  },

  reconnectAttempts: 0,

  lastDisconnectCode: null,
};

// ============================================================
// BOT INSTANCE
// ============================================================

let currentBot: BotInstance | null = null;

/**
 * Set the active WhatsApp bot instance.
 *
 * The dashboard stores the reference but does NOT access the
 * socket directly for status information.
 */
export function setDashboardBot(bot: BotInstance | null): void {
  currentBot = bot;
}

/**
 * Get the active dashboard bot instance.
 *
 * This exists for compatibility with existing callers.
 */
export function getDashboardBot(): BotInstance | null {
  return currentBot;
}

// ============================================================
// WHATSAPP RUNTIME API
// ============================================================

export function setWhatsAppRuntime(patch: Partial<WhatsAppRuntimeState>): void {
  Object.assign(whatsappState, patch);

  if (patch.user) {
    whatsappState.user = {
      ...whatsappState.user,
      ...patch.user,
    };
  }
}

export function getWhatsAppRuntime(): WhatsAppRuntimeState {
  return {
    ...whatsappState,

    user: {
      ...whatsappState.user,
    },
  };
}

// ============================================================
// MESSAGE RATE
// ============================================================

let lastMessageCount = 0;
let lastMessageSampleAt = Date.now();

let messagesPerMinute = 0;

// ============================================================
// CPU SAMPLING
// ============================================================

let previousCpuUsage = process.cpuUsage();

let previousCpuSampleAt = process.hrtime.bigint();

let cpuUsagePercent = 0;

// ============================================================
// BOT STATUS
// ============================================================

/**
 * Return dashboard-safe WhatsApp status.
 *
 * IMPORTANT:
 * Never access `bot.sock` here.
 *
 * The WhatsApp socket can legitimately be unavailable while
 * reconnecting or disconnected. Dashboard telemetry must never
 * crash the application because of that.
 */
export function getBotStatus(): DashboardBotStatus {
  const runtime = getWhatsAppRuntime();

  updateMessageRate();

  const connection = normalizeConnectionState(runtime.connection);

  const connected = runtime.connected && connection === 'open';

  const errorRate =
    botStats.messagesProcessed > 0 ? (botStats.errors / botStats.messagesProcessed) * 100 : 0;

  let uptime = 0;

  if (connected && runtime.connectedAt) {
    const connectedTimestamp = Date.parse(runtime.connectedAt);

    if (!Number.isNaN(connectedTimestamp)) {
      uptime = Math.max(0, Date.now() - connectedTimestamp);
    }
  }

  return {
    connected,

    connection,

    messagesProcessed: botStats.messagesProcessed,

    commandsExecuted: botStats.commandsExecuted,

    errors: botStats.errors,

    reconnectAttempts: runtime.reconnectAttempts,

    connectedAt: connected ? runtime.connectedAt : null,

    uptime,

    uptimeFormatted: formatDuration(uptime),

    messagesPerMinute: Number(messagesPerMinute.toFixed(2)),

    errorRate: Number(errorRate.toFixed(2)),

    user: {
      id: connected ? runtime.user.id : null,

      name: connected ? runtime.user.name : null,
    },
  };
}

// ============================================================
// SYSTEM STATUS
// ============================================================

export function getSystemStatus(): DashboardSystemStatus {
  updateCpuUsage();

  const totalMemory = os.totalmem();

  const freeMemory = os.freemem();

  const usedMemory = totalMemory - freeMemory;

  const memoryUsagePercent = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;

  const load = os.loadavg();

  const cpuCores = Math.max(os.cpus().length, 1);

  const processMemory = process.memoryUsage();

  const processUptime = process.uptime();

  return {
    platform: os.platform(),

    arch: os.arch(),

    hostname: os.hostname(),

    cpu: {
      cores: cpuCores,

      usage: Number(cpuUsagePercent.toFixed(2)),

      usagePercent: Number(cpuUsagePercent.toFixed(2)),

      loadAverage: {
        oneMinute: Number((load[0] ?? 0).toFixed(2)),

        fiveMinutes: Number((load[1] ?? 0).toFixed(2)),

        fifteenMinutes: Number((load[2] ?? 0).toFixed(2)),
      },
    },

    memory: {
      total: totalMemory,

      used: usedMemory,

      free: freeMemory,

      usagePercent: Number(memoryUsagePercent.toFixed(2)),

      totalMB: toMB(totalMemory),

      usedMB: toMB(usedMemory),

      freeMB: toMB(freeMemory),

      totalGB: toGB(totalMemory),

      usedGB: toGB(usedMemory),

      freeGB: toGB(freeMemory),
    },

    node: {
      version: process.version,

      uptime: processUptime,

      uptimeFormatted: formatDuration(processUptime * 1_000),
    },

    process: {
      pid: process.pid,

      uptime: processUptime,

      uptimeFormatted: formatDuration(processUptime * 1_000),

      memory: {
        rss: processMemory.rss,

        heapUsed: processMemory.heapUsed,

        heapTotal: processMemory.heapTotal,

        rssMB: toMB(processMemory.rss),

        heapUsedMB: toMB(processMemory.heapUsed),

        heapTotalMB: toMB(processMemory.heapTotal),
      },
    },
  };
}

// ============================================================
// HEALTH
// ============================================================

/**
 * Dashboard health.
 *
 * This function is intentionally defensive.
 *
 * A disconnected WhatsApp socket is a service state,
 * NOT an application exception.
 */
export async function getHealthStatus(): Promise<DashboardHealthStatus> {
  const services: DashboardHealthStatus['services'] = [];

  // ----------------------------------------------------------
  // WhatsApp
  // ----------------------------------------------------------

  try {
    const runtime = getWhatsAppRuntime();

    if (runtime.connected && runtime.connection === 'open') {
      services.push({
        name: 'WhatsApp',
        status: 'healthy',
        message: 'WhatsApp connection is active.',
        latency: 0,
      });
    } else if (runtime.connection === 'connecting') {
      services.push({
        name: 'WhatsApp',
        status: 'degraded',
        message: 'WhatsApp is connecting.',
        latency: 0,
      });
    } else {
      services.push({
        name: 'WhatsApp',
        status: 'unhealthy',
        message: 'WhatsApp connection is not active.',
        latency: 0,
      });
    }
  } catch (error) {
    logger.error(
      {
        error,
      },
      'Failed to collect WhatsApp dashboard health.'
    );

    services.push({
      name: 'WhatsApp',
      status: 'unhealthy',
      message: 'Unable to read WhatsApp runtime state.',
      latency: 0,
    });
  }

  // ----------------------------------------------------------
  // Notification
  // ----------------------------------------------------------

  try {
    const history = notificationService.getHistory();

    services.push({
      name: 'Notification',
      status: 'healthy',
      message: `Notification service is active. ${history.length} notification(s) recorded.`,
      latency: 0,
    });
  } catch (error) {
    logger.error(
      error instanceof Error ? error : new Error(String(error)),
      'Notification health check failed.'
    );

    services.push({
      name: 'Notification',
      status: 'unhealthy',
      message: 'Notification service is unavailable.',
      latency: 0,
    });
  }

  // ----------------------------------------------------------
  // Node.js
  // ----------------------------------------------------------

  services.push({
    name: 'Node.js',
    status: 'healthy',
    message: `Running ${process.version}.`,
    latency: 0,
  });

  // ----------------------------------------------------------
  // Overall status
  // ----------------------------------------------------------

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (services.some((service) => service.status === 'unhealthy')) {
    status = 'unhealthy';
  } else if (services.some((service) => service.status === 'degraded')) {
    status = 'degraded';
  }

  return Promise.resolve({
    status,
    services,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// METRICS
// ============================================================

export function getMetrics(): DashboardMetrics {
  const bot = getBotStatus();

  return {
    messagesProcessed: bot.messagesProcessed,

    commandsExecuted: bot.commandsExecuted,

    errors: bot.errors,

    errorRate: bot.errorRate,

    messagesPerMinute: bot.messagesPerMinute,

    reconnectAttempts: bot.reconnectAttempts,

    notificationCount: notificationService.getHistory().length,
  };
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export function getNotificationHistory() {
  return notificationService.getHistory();
}

// ============================================================
// CPU
// ============================================================

function updateCpuUsage(): void {
  const now = process.hrtime.bigint();

  const elapsedNanoseconds = Number(now - previousCpuSampleAt);

  if (elapsedNanoseconds <= 0) {
    return;
  }

  const currentCpuUsage = process.cpuUsage();

  const userDifference = currentCpuUsage.user - previousCpuUsage.user;

  const systemDifference = currentCpuUsage.system - previousCpuUsage.system;

  const cpuTimeMicros = userDifference + systemDifference;

  const elapsedMicros = elapsedNanoseconds / 1_000;

  const cpuCount = Math.max(os.cpus().length, 1);

  cpuUsagePercent = Math.min(100, Math.max(0, (cpuTimeMicros / elapsedMicros / cpuCount) * 100));

  previousCpuUsage = currentCpuUsage;

  previousCpuSampleAt = now;
}

// ============================================================
// MESSAGE RATE
// ============================================================

function updateMessageRate(): void {
  const now = Date.now();

  const elapsed = now - lastMessageSampleAt;

  if (elapsed < 5_000) {
    return;
  }

  const current = botStats.messagesProcessed;

  const difference = Math.max(0, current - lastMessageCount);

  messagesPerMinute = difference / (elapsed / 60_000);

  lastMessageCount = current;

  lastMessageSampleAt = now;
}

// ============================================================
// HELPERS
// ============================================================

function normalizeConnectionState(connection: string | undefined): DashboardConnectionState {
  switch (connection) {
    case 'open':
      return 'open';

    case 'connecting':
      return 'connecting';

    case 'close':
    case 'closed':
      return 'close';

    default:
      return 'close';
  }
}

function toMB(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function toGB(bytes: number): number {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
}

function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, milliseconds);

  const seconds = Math.floor(safeMilliseconds / 1_000);

  const days = Math.floor(seconds / 86_400);

  const hours = Math.floor((seconds % 86_400) / 3_600);

  const minutes = Math.floor((seconds % 3_600) / 60);

  const remainingSeconds = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}
