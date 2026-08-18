// src/core/dns-tester.ts
import dns from 'node:dns';
import { logger } from '../logging/logger';
import { metrics } from '../metrics/metrics';
import { appEvents, AppEvent } from '../../app/events';

interface DnsTestResult {
  domain: string;
  resolved: boolean;
  ipv4?: string[];
  ipv6?: string[];
  latency?: number;
  error?: string;
}

export class DnsTester {
  private cache: Map<string, { timestamp: number; result: DnsTestResult }> = new Map();
  private readonly cacheValidityMs = 5 * 60 * 1000; // 5 minutes

  async testDomain(domain: string, useCache = true): Promise<DnsTestResult> {
    // Check cache
    if (useCache) {
      const cached = this.cache.get(domain);
      if (cached && Date.now() - cached.timestamp < this.cacheValidityMs) {
        return cached.result;
      }
    }

    const startTime = Date.now();

    try {
      const [ipv4, ipv6] = await Promise.all([
        dns.promises.resolve4(domain).catch(() => []),
        dns.promises.resolve6(domain).catch(() => []),
      ]);

      const latency = Date.now() - startTime;
      const result: DnsTestResult = {
        domain,
        resolved: ipv4.length > 0 || ipv6.length > 0,
        ipv4: ipv4.length > 0 ? ipv4 : undefined,
        ipv6: ipv6.length > 0 ? ipv6 : undefined,
        latency,
      };

      // Update cache
      this.cache.set(domain, { timestamp: Date.now(), result });

      // Record metrics
      metrics.record('dns_resolution_time', latency, { domain });
      metrics.record('dns_resolution_success', result.resolved ? 1 : 0, { domain });

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const result: DnsTestResult = {
        domain,
        resolved: false,
        latency,
        error: error instanceof Error ? error.message : String(error),
      };

      // Record failure metric
      metrics.record('dns_resolution_failure', 1, { domain });

      return result;
    }
  }

  async testMultipleDomains(domains: string[]): Promise<DnsTestResult[]> {
    logger.info('🔍 Testing DNS resolution...');

    const results = await Promise.all(domains.map((domain) => this.testDomain(domain)));

    // Log results
    const successful = results.filter((r) => r.resolved).length;
    const failed = results.filter((r) => !r.resolved);

    logger.info(`📊 DNS Test Results: ${successful}/${domains.length} domains resolved`);

    if (failed.length > 0) {
      logger.warn('⚠️ Failed domains:');
      failed.forEach((result) => {
        logger.warn(`   - ${result.domain}: ${result.error || 'No records found'}`);
      });
    }

    // Emit event
    appEvents.emit(AppEvent.DNS_TEST_COMPLETE, results);

    return results;
  }

  async validateCriticalDomains(domains: string[]): Promise<boolean> {
    const results = await this.testMultipleDomains(domains);
    const criticalFailures = results.filter((r) => !r.resolved);

    if (criticalFailures.length > 0) {
      logger.error(
        `❌ Critical DNS failures detected for: ${criticalFailures.map((f) => f.domain).join(', ')}`
      );
      return false;
    }

    return true;
  }
}

export const dnsTester = new DnsTester();
