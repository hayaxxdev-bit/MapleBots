// src/index.ts
// CRITICAL: DNS Configuration untuk mengatasi masalah IPv6
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

type ShutdownSignal = 'SIGINT' | 'SIGTERM' | 'SIGQUIT';

interface BotInstance {
  readonly stop: () => Promise<void>;
}

async function testDnsResolution(): Promise<void> {
  try {
    logger.info('🔍 Testing DNS resolution...');
    
    const results = await Promise.allSettled([
      dns.promises.resolve4('api.jikan.moe'),
      dns.promises.resolve6('api.jikan.moe'),
    ]);
    
    const [ipv4Result, ipv6Result] = results;
    
    if (ipv4Result.status === 'fulfilled') {
      logger.info(`   ✅ IPv4 addresses: ${ipv4Result.value.join(', ')}`);
    } else {
      logger.warn('   ⚠️ No IPv4 addresses found for api.jikan.moe');
    }
    
    if (ipv6Result.status === 'fulfilled') {
      logger.info(`   ✅ IPv6 addresses: ${ipv6Result.value.join(', ')}`);
    } else {
      logger.info('   ℹ️ No IPv6 addresses found (normal if IPv6 is disabled)');
    }
  } catch (error) {
    logHelper.error('dns-test', error);
  }
}

async function bootstrap(): Promise<void> {
  logger.info('🚀 Starting WhatsApp Bot...');
  logger.info(`Environment: ${config.isProduction ? 'Production' : 'Development'}`);
  logger.info(`Bot Name: ${config.botName}`);
  logger.info(`Prefix: ${config.prefix}`);
  logger.info(`DNS: IPv4-first (forced)`);
  
  await testDnsResolution();
  
  const bot = await startBot();
  setupGracefulShutdown(bot);
  
  logger.info('✅ Bot is ready and running!');
}

function setupGracefulShutdown(bot: BotInstance): void {
  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    
    try {
      await bot.stop();
      logger.info('Bot connection closed.');
      await logger.flush();
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