// src/scrapers/scraper-manager.ts
import { config } from '../../config/config';
import { logger, logHelper } from '../logging/logger';
import { CacheManager } from '../cache/cache';

interface ScraperHealth {
  name: string;
  type: string;
  status: 'healthy' | 'degraded' | 'down';
  lastCheck: Date;
  responseTime: number;
  errorCount: number;
  successCount: number;
}

interface ScraperResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  scraper?: string;
  responseTime?: number;
}

/**
 * Base Scraper class
 */
export abstract class BaseScraper {
  protected name: string;
  protected type: string;
  protected baseUrl: string;
  protected timeout: number;
  protected health: ScraperHealth;
  protected cache: CacheManager;

  constructor(name: string, type: string, baseUrl: string) {
    this.name = name;
    this.type = type;
    this.baseUrl = baseUrl;
    this.timeout = config.scraperTimeout;
    this.cache = CacheManager.getInstance();
    this.health = {
      name,
      type,
      status: 'healthy',
      lastCheck: new Date(),
      responseTime: 0,
      errorCount: 0,
      successCount: 0,
    };
  }

  abstract search(query: string): Promise<ScraperResult<unknown>>;
  abstract getDetail(id: string): Promise<ScraperResult<unknown>>;

  getHealth(): ScraperHealth {
    return { ...this.health };
  }

  protected async request<T>(url: string): Promise<T> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = `${this.name}:${url}`;
      if (config.scraperCacheEnabled) {
        const cached = this.cache.get<T>(cacheKey);
        if (cached) {
          this.health.successCount++;
          this.health.responseTime = Date.now() - startTime;
          return cached;
        }
      }

      // Make request (would use axios here)
      const response = await this.makeRequest<T>(url);

      // Cache response
      if (config.scraperCacheEnabled) {
        this.cache.set(cacheKey, response, config.scraperCacheTtl);
      }

      this.health.successCount++;
      this.health.status = 'healthy';
      this.health.responseTime = Date.now() - startTime;
      this.health.lastCheck = new Date();

      return response;
    } catch (error) {
      this.health.errorCount++;
      this.health.status = this.health.errorCount > 3 ? 'down' : 'degraded';
      this.health.responseTime = Date.now() - startTime;
      this.health.lastCheck = new Date();

      throw error;
    }
  }

  protected abstract makeRequest<T>(url: string): Promise<T>;
}

/**
 * Scraper Manager - manages all scrapers and fallback logic
 */
export class ScraperManager {
  private static instance: ScraperManager;
  private scrapers: Map<string, BaseScraper[]> = new Map();
  private activeScrapers: Map<string, BaseScraper> = new Map();
  private cache: CacheManager;

  private constructor() {
    this.cache = CacheManager.getInstance();
  }

  static getInstance(): ScraperManager {
    if (!ScraperManager.instance) {
      ScraperManager.instance = new ScraperManager();
    }
    return ScraperManager.instance;
  }

  initialize(): Promise<void> {
    logger.info('Scraper Manager initialized');
    // Register scrapers based on config
    this.registerAnimeScrapers();
    this.registerMangaScrapers();
    this.registerApiScrapers();
    return Promise.resolve();
  }

  private registerAnimeScrapers(): void {
    const animeScrapers: BaseScraper[] = [];
    const scraperNames = [config.animeScraper, ...config.animeScraperFallback];

    scraperNames.forEach((name) => {
      // Would instantiate actual scraper classes here
      // For now, just logging
      logger.debug(`Registered anime scraper: ${name}`);
    });

    this.scrapers.set('anime', animeScrapers);
  }

  private registerMangaScrapers(): void {
    const mangaScrapers: BaseScraper[] = [];
    const scraperNames = [config.mangaScraper, ...config.mangaScraperFallback];

    scraperNames.forEach((name) => {
      // Would instantiate actual scraper classes here
      logger.debug(`Registered manga scraper: ${name}`);
    });

    this.scrapers.set('manga', mangaScrapers);
  }

  private registerApiScrapers(): void {
    // Register API-based services
    if (config.features['waifu']) {
      logger.debug(`Registered waifu API: ${config.waifuIm}`);
    }
    if (config.features['nekos']) {
      logger.debug(`Registered nekos API: ${config.nekosApi}`);
    }
  }

  healthCheck(): Promise<ScraperHealth[]> {
    logger.info('🏥 Running scraper health check...');
    const allHealth: ScraperHealth[] = [];

    for (const [type, scrapers] of this.scrapers) {
      for (const scraper of scrapers) {
        const health = scraper.getHealth();
        allHealth.push(health);

        if (health.status === 'down') {
          logHelper.warn('scraper-health', `${type}/${health.name} is DOWN`);

          // Auto switch to fallback
          if (config.scraperAutoSwitch) {
            this.switchToFallback(type);
          }
        }
      }
    }

    return Promise.resolve(allHealth);
  }
  private switchToFallback(type: string): void {
    const scrapers = this.scrapers.get(type);
    if (!scrapers || scrapers.length === 0) {
      return;
    }

    // Find first healthy scraper
    const healthyScraper = scrapers.find((s) => s.getHealth().status === 'healthy');
    if (healthyScraper) {
      this.activeScrapers.set(type, healthyScraper);
      logger.info(`Switched ${type} scraper to ${healthyScraper.getHealth().name}`);
    }
  }

  async execute<T>(
    type: string,
    operation: string,
    params: Record<string, unknown>
  ): Promise<ScraperResult<T>> {
    const scrapers = this.scrapers.get(type);
    if (!scrapers || scrapers.length === 0) {
      return {
        success: false,
        error: `No scrapers registered for type: ${type}`,
      } as ScraperResult<T>;
    }

    // Try active scraper first
    const activeScraper = this.activeScrapers.get(type);
    if (activeScraper) {
      try {
        const result = await this.executeScraper(activeScraper, operation, params);
        if (result.success) {
          return result as ScraperResult<T>;
        }
      } catch (error) {
        logHelper.warn('scraper', `${type}/${activeScraper.getHealth().name} failed`);
      }
    }

    // Try all scrapers if fallback enabled
    if (config['scraperFallbackEnabled']) {
      for (const scraper of scrapers) {
        if (scraper === activeScraper) {
          continue;
        }

        try {
          const result = await this.executeScraper(scraper, operation, params);
          if (result.success) {
            this.activeScrapers.set(type, scraper);
            return result as ScraperResult<T>;
          }
        } catch (error) {
          logHelper.warn('scraper', `${type}/${scraper.getHealth().name} failed`);
        }
      }
    }

    return {
      success: false,
      error: `All ${type} scrapers failed`,
    } as ScraperResult<T>;
  }

  private async executeScraper<T>(
    scraper: BaseScraper,
    operation: string,
    params: Record<string, unknown>
  ): Promise<ScraperResult<T>> {
    const startTime = Date.now();

    try {
      let result: unknown;

      switch (operation) {
        case 'search':
          result = await scraper.search(params['query'] as string);
          break;
        case 'detail':
          result = await scraper.getDetail(params['id'] as string);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      logHelper.scraper({
        scraper: scraper.getHealth().name,
        operation,
        status: 'success',
        duration: Date.now() - startTime,
      });

      return {
        success: true,
        data: result as T,
        scraper: scraper.getHealth().name,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      logHelper.scraper({
        scraper: scraper.getHealth().name,
        operation,
        status: 'failed',
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        scraper: scraper.getHealth().name,
        responseTime: Date.now() - startTime,
      };
    }
  }

  getActiveScrapers(): Map<string, string> {
    const active = new Map<string, string>();
    this.activeScrapers.forEach((scraper, type) => {
      active.set(type, scraper.getHealth().name);
    });
    return active;
  }

  getAllHealth(): ScraperHealth[] {
    const allHealth: ScraperHealth[] = [];
    this.scrapers.forEach((scrapers) => {
      scrapers.forEach((scraper) => {
        allHealth.push(scraper.getHealth());
      });
    });
    return allHealth;
  }
}

// Export singleton instance
export default ScraperManager;
