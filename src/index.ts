// src/index.ts
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
dns.setServers([
  '8.8.8.8',       // Google DNS IPv4
  '8.8.4.4',       // Google DNS IPv4 secondary
  '1.1.1.1',       // Cloudflare DNS IPv4
  '1.0.0.1',       // Cloudflare DNS IPv4 secondary
]);

import { startBot } from './connection/connection';
import { logger, logHelper } from './utils/logger';
import { config } from './config/config';
import { CacheManager } from './utils/cache';
import { DatabaseManager } from './utils/database';
import { ScraperManager } from './scrapers/scraper-manager';
import { sessionEmitter } from './utils/session-event';

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGQUIT';

interface BotInstance {
  readonly stop: () => Promise<void>;
}

interface AppServices {
  readonly cache: CacheManager;
  readonly database: DatabaseManager;
  readonly scraperManager: ScraperManager;
}

async function testDnsResolution(): Promise<void> {
  try {
    logger.info('🔍 Testing DNS resolution...');
    
    const domains = [
      'web.whatsapp.com',
      'api.jikan.moe',
      'api.waifu.im',
      'nekos.best',
      ...config.scraperUrls,
    ];
    
    const results = await Promise.allSettled(
      domains.map(domain => dns.promises.resolve4(domain))
    );
    
    domains.forEach((domain, index) => {
      const result = results[index];
      if (result?.status === 'fulfilled') {
        logger.debug(`   ✅ ${domain}: ${result.value.join(', ')}`);
      } else {
        logger.warn(`   ⚠️ ${domain}: DNS resolution failed`);
      }
    });
  } catch (error) {
    logHelper.error('dns-test', error);
  }
}

async function initializeServices(): Promise<AppServices> {
  logger.info('🔧 Initializing services...');
  
  // Initialize cache
  const cache = CacheManager.getInstance();
  logger.info('   ✅ Cache manager initialized');
  
  // Initialize database
  const database = DatabaseManager.getInstance();
  await database.initialize();
  logger.info('   ✅ Database initialized');
  
  // Initialize scraper manager
  const scraperManager = ScraperManager.getInstance();
  await scraperManager.initialize();
  logger.info('   ✅ Scraper manager initialized');
  
  return { cache, database, scraperManager };
}

async function checkScraperHealth(scraperManager: ScraperManager): Promise<void> {
  if (config.scraperHealthCheck) {
    logger.info('🏥 Checking scraper health...');
    await scraperManager.healthCheck();
  }
}

// Di function bootstrap()
async function bootstrap(): Promise<void> {
  logger.info('🚀 Starting WhatsApp Bot...');
  logger.info(`Environment: ${config.isProduction ? 'Production' : 'Development'}`);
  logger.info(`Bot Name: ${config.botName}`);
  logger.info(`Prefix: ${config.prefix}`);
  logger.info(`DNS: IPv4-first (forced)`);
  logger.info(`Time Zone: ${config.timezone}`);
  
  // Log config summary
  logger.info('📋 Config Summary:');
  logger.info(`   ├ Bot Mode: ${config.botMode}`);
  logger.info(`   ├ Auto Read: ${config.autoRead}`);
  logger.info(`   ├ Auto Typing: ${config.autoTyping}`);
  logger.info(`   ├ Rate Limit: ${config.rateLimitEnabled ? 'Enabled' : 'Disabled'}`);
  logger.info(`   └ Features: ${Object.entries(config.features).filter(([, v]) => v).length} enabled`);
  
  await testDnsResolution();
  
  const services = await initializeServices();
  
  await checkScraperHealth(services.scraperManager);
  
  const bot = await startBot();
  
  setupGracefulShutdown(bot, services);
  
  logger.info('✅ Bot is ready and running!');
  
  startBackgroundTasks(services);
}

function startBackgroundTasks(services: AppServices): void {
  // Auto cleanup temp files
  if (config.tempCleanupInterval > 0) {
    setInterval(() => {
      cleanupTempFiles();
    }, config.tempCleanupInterval * 60 * 1000);
  }
  
  // Scraper health check interval
  if (config.scraperHealthCheck && config.scraperCheckInterval > 0) {
    setInterval(async () => {
      await services.scraperManager.healthCheck();
    }, config.scraperCheckInterval);
  }
  
  // Session auto-save
 if (config.sessionSaveInterval > 0) {
  setInterval(() => {
    // ✅ Menggunakan custom event emitter (type-safe & bersih)
    sessionEmitter.emit('save-session');
  }, config.sessionSaveInterval);
}
}

function cleanupTempFiles(): void {
  try {
    const fs = require('fs');
    const path = require('path');
    const tempDir = path.resolve(config.tempDir);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      return;
    }
    
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    let cleanedCount = 0;
    
    files.forEach((file: string) => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const age = (now - stats.mtimeMs) / (60 * 1000); // age in minutes
      
      if (age > config.tempCleanupInterval) {
        try {
          fs.unlinkSync(filePath);
          cleanedCount++;
        } catch (error) {
          logHelper.warn('cleanup', `Failed to delete ${file}`);
        }
      }
    });
    
    if (cleanedCount > 0) {
      logger.info(`🧹 Cleaned ${cleanedCount} temp files`);
    }
  } catch (error) {
    logHelper.error('cleanup', error);
  }
}

function setupGracefulShutdown(bot: BotInstance, services: AppServices): void {
  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    
    try {
      // Close bot connection
      await bot.stop();
      logger.info('✅ Bot connection closed.');
      
      // Close database
      await services.database.close();
      logger.info('✅ Database closed.');
      
      // Clear cache
      await services.cache.clear();
      logger.info('✅ Cache cleared.');
      
      // Flush logs
      await logger.flush();
      
      logger.info('👋 Shutdown complete. Goodbye!');
      process.exit(0);
    } catch (error) {
      logHelper.error('shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGQUIT', () => void shutdown('SIGQUIT'));
}

function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logHelper.error('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
  });

  process.on('uncaughtException', (error: Error) => {
    logHelper.error('uncaughtException', error);
    logger.fatal('Uncaught exception detected. Process will exit.');
    
    // Notify owner if enabled
    if (config.notifyOnCrash) {
      // Send notification (implement based on your notification system)
    }
    
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('warning', (warning: Error) => { 
    logger.warn(warning, 'Node.js warning');
  });
}

setupGlobalErrorHandlers();

bootstrap().catch((error: unknown) => {
  logHelper.error('bootstrap', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});