// src/infrastructure/metrics/metrics.ts
import { logger } from '../logging/logger';
import { appEvents, AppEvent } from '../../app/events';

export interface MetricData {
  readonly name: string;
  readonly value: number;
  readonly timestamp: Date;
  readonly tags?: Record<string, string>;
}

export interface MetricSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
}

class MetricsCollector {
  private readonly metrics = new Map<string, MetricData[]>();
  private readonly maxMetricsPerName = 1_000;
  private summaryTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.summaryTimer) {
      return;
    }

    this.summaryTimer = setInterval(
      () => {
        const summary = this.getSummary();

        if (Object.keys(summary).length > 0) {
          logger.debug({ summary }, 'Metrics summary');
        }
      },
      5 * 60 * 1_000
    );
  }

  stop(): void {
    if (!this.summaryTimer) {
      return;
    }

    clearInterval(this.summaryTimer);
    this.summaryTimer = null;
  }

  record(name: string, value: number, tags?: Record<string, string>): void {
    const metric: MetricData = {
      name,
      value,
      timestamp: new Date(),
      tags,
    };

    const values = this.metrics.get(name) ?? [];
    values.push(metric);

    if (values.length > this.maxMetricsPerName) {
      values.shift();
    }

    this.metrics.set(name, values);
    appEvents.emit(AppEvent.METRICS_UPDATED, metric);
  }

  get(name: string): MetricData[] {
    return [...(this.metrics.get(name) ?? [])];
  }

  getAverage(name: string, windowMs?: number): number | null {
    const values = this.get(name);
    if (values.length === 0) {
      return null;
    }

    const now = Date.now();
    const filtered = windowMs
      ? values.filter((item) => now - item.timestamp.getTime() <= windowMs)
      : values;

    if (filtered.length === 0) {
      return null;
    }

    return filtered.reduce((sum, item) => sum + item.value, 0) / filtered.length;
  }

  getAll(): Record<string, MetricData[]> {
    return Object.fromEntries(
      [...this.metrics.entries()].map(([name, values]) => [name, [...values]])
    );
  }

  clear(name?: string): void {
    if (name) {
      this.metrics.delete(name);
      return;
    }

    this.metrics.clear();
  }

  getSummary(): Record<string, MetricSummary> {
    const summary: Record<string, MetricSummary> = {};

    for (const [name, values] of this.metrics) {
      if (values.length === 0) {
        continue;
      }

      const numbers = values.map((item) => item.value);
      const sum = numbers.reduce((a, b) => a + b, 0);

      summary[name] = {
        count: numbers.length,
        avg: sum / numbers.length,
        min: Math.min(...numbers),
        max: Math.max(...numbers),
      };
    }

    return summary;
  }
}

export const metrics = new MetricsCollector();
