// src/core/dashboard/metrics-tracker.ts
import * as os from 'node:os';
import { getWhatsAppRuntime } from './runtime-state';
import { notificationService } from '../../infrastructure/notification/notification-service';

export interface NotificationEntry {
  id: string;
  type?: string;
  title: string;
  message: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  timestamp: number;
}

const WINDOW = 60_000;

class MetricsTracker {
  private static instance: MetricsTracker;
  private messagesProcessed = 0;
  private commandsExecuted = 0;
  private errorsCount = 0;
  private timestamps: number[] = [];
  private previousCpu: { idle: number; total: number } | null = null;

  // FIX: Tambahkan storage & batas maksimum untuk notifikasi dashboard
  private notifications: NotificationEntry[] = [];
  private readonly maxNotifications = 100;

  private constructor() {}

  static getInstance() {
    return (this.instance ??= new MetricsTracker());
  }

  // FIX: Method pushNotification yang dipanggil oleh dashboardNotifications.ts
  pushNotification(entry: NotificationEntry): void {
    this.notifications.push(entry);
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.shift();
    }
  }

  getNotifications(): NotificationEntry[] {
    return this.notifications;
  }

  recordMessage() {
    this.messagesProcessed++;
    this.timestamps.push(Date.now());
    this.prune();
  }

  recordCommand() {
    this.commandsExecuted++;
  }

  recordError() {
    this.errorsCount++;
  }

  private prune() {
    const cutoff = Date.now() - WINDOW;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
  }

  getBotStatus() {
    this.prune();
    const r = getWhatsAppRuntime();
    const uptime = r.connectedAt ? Math.max(0, Date.now() - Date.parse(r.connectedAt)) : 0;
    return {
      connected: r.connected,
      connection: r.connection,
      messagesProcessed: this.messagesProcessed,
      commandsExecuted: this.commandsExecuted,
      errors: this.errorsCount,
      reconnectAttempts: r.reconnectAttempts,
      connectedAt: r.connectedAt,
      uptime,
      uptimeFormatted: formatUptime(uptime),
      messagesPerMinute: this.timestamps.length,
      errorRate: this.messagesProcessed ? (this.errorsCount / this.messagesProcessed) * 100 : 0,
      user: r.user,
      lastDisconnectCode: r.lastDisconnectCode,
    };
  }

  getSystemInfo() {
    const cpus = os.cpus(),
      total = os.totalmem(),
      free = os.freemem(),
      used = total - free,
      cpu = this.cpu(cpus),
      pm = process.memoryUsage(),
      loads = os.loadavg();
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpu: {
        cores: cpus.length,
        usage: cpu,
        usagePercent: cpu,
        loadAverage: {
          oneMinute: loads[0] ?? 0,
          fiveMinutes: loads[1] ?? 0,
          fifteenMinutes: loads[2] ?? 0,
        },
      },
      memory: {
        total,
        free,
        used,
        usagePercent: (used / total) * 100,
        totalMB: total / 1048576,
        usedMB: used / 1048576,
        freeMB: free / 1048576,
        totalGB: total / 1073741824,
        usedGB: used / 1073741824,
        freeGB: free / 1073741824,
      },
      node: {
        version: process.version,
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime() * 1000),
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime() * 1000),
        memory: {
          rss: pm.rss,
          heapUsed: pm.heapUsed,
          heapTotal: pm.heapTotal,
          external: pm.external,
          arrayBuffers: pm.arrayBuffers,
          rssMB: pm.rss / 1048576,
          heapUsedMB: pm.heapUsed / 1048576,
          heapTotalMB: pm.heapTotal / 1048576,
        },
      },
      systemUptime: os.uptime(),
    };
  }

  getSummary() {
    const b = this.getBotStatus();
    const s = this.getSystemInfo();

    return {
      messagesProcessed: b.messagesProcessed,
      commandsExecuted: b.commandsExecuted,
      errors: b.errors,
      errorRate: b.errorRate,
      messagesPerMinute: b.messagesPerMinute,
      reconnectAttempts: b.reconnectAttempts,
      notificationCount: notificationService.getHistory().length,
      cpuUsage: s.cpu.usagePercent,
      memoryUsage: s.memory.usagePercent,
    };
  }

  private cpu(cpus: os.CpuInfo[]) {
    let idle = 0,
      total = 0;
    for (const c of cpus) {
      idle += c.times.idle;
      total += Object.values(c.times).reduce((a: number, b: number) => a + b, 0);
    }
    if (!this.previousCpu) {
      this.previousCpu = { idle, total };
      return 0;
    }
    const di = idle - this.previousCpu.idle,
      dt = total - this.previousCpu.total;
    this.previousCpu = { idle, total };
    return dt > 0 ? Math.max(0, Math.min(100, 100 - (di / dt) * 100)) : 0;
  }
}

function formatUptime(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000),
    d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
}

export const metricsTracker = MetricsTracker.getInstance();
