// src/utils/rate-limiter.ts
import { config } from '../config/config';
import { logger } from './logger';

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

/**
 * Rate Limiter for anti-spam protection
 */
export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitInfo> = new Map();
  private commandCooldowns: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Setup cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, config.rateLimitWindow);
  }

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Check if user is rate limited
   */
  isRateLimited(userId: string): boolean {
    if (!config.rateLimitEnabled) return false;

    const now = Date.now();
    const limit = this.limits.get(userId);

    if (!limit || limit.resetTime <= now) {
      this.limits.set(userId, {
        count: 1,
        resetTime: now + config.rateLimitWindow,
      });
      return false;
    }

    if (limit.count >= config.rateLimitMax) {
      return true;
    }

    limit.count++;
    return false;
  }

  /**
   * Check command cooldown
   */
  isOnCooldown(userId: string, command: string): boolean {
    if (config.cooldownPerCommand <= 0) return false;

    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastUsed = this.commandCooldowns.get(key);

    if (lastUsed && now - lastUsed < config.cooldownPerCommand) {
      return true;
    }

    this.commandCooldowns.set(key, now);
    return false;
  }

  /**
   * Get remaining cooldown time
   */
  getCooldownRemaining(userId: string, command: string): number {
    if (config.cooldownPerCommand <= 0) return 0;

    const key = `${userId}:${command}`;
    const now = Date.now();
    const lastUsed = this.commandCooldowns.get(key);

    if (!lastUsed) return 0;

    const remaining = config.cooldownPerCommand - (now - lastUsed);
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Clear rate limit for user
   */
  clearUser(userId: string): void {
    this.limits.delete(userId);
    
    // Clear user's command cooldowns
    const prefix = `${userId}:`;
    for (const key of this.commandCooldowns.keys()) {
      if (key.startsWith(prefix)) {
        this.commandCooldowns.delete(key);
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, limit] of this.limits) {
      if (limit.resetTime <= now) {
        this.limits.delete(key);
      }
    }

    for (const [key, lastUsed] of this.commandCooldowns) {
      if (now - lastUsed > config.cooldownPerCommand * 2) {
        this.commandCooldowns.delete(key);
      }
    }
  }

  /**
   * Get rate limit stats
   */
  getStats(): Record<string, unknown> {
    return {
      totalLimits: this.limits.size,
      totalCooldowns: this.commandCooldowns.size,
      rateLimitEnabled: config.rateLimitEnabled,
      maxRequests: config.rateLimitMax,
      windowMs: config.rateLimitWindow,
    };
  }

  /**
   * Destroy rate limiter
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.limits.clear();
    this.commandCooldowns.clear();
  }
}

// Export singleton instance
export default RateLimiter;