// src/utils/pretty-logger.ts
import pino, { Logger } from 'pino';
import { config } from '../config/config';

/**
 * Custom pretty logger with better formatting
 */
export const prettyLogger: Logger = pino({
  level: config.logLevel,
  timestamp: () => `,"time":"${new Date().toLocaleTimeString('id-ID', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  })}"`,
  base: undefined, // Remove default base fields
  formatters: {
    level(label, number) {
      return { level: label.toUpperCase() };
    },
  },
}, pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: false,
    ignore: 'pid,hostname',
    singleLine: true,
    messageFormat: '{msg}',
    customColors: {
      INFO: 'blue',
      WARN: 'yellow',
      ERROR: 'red',
      DEBUG: 'green',
      FATAL: 'magenta',
    },
  },
}));

/**
 * Custom logger with emoji and colors
 */
export class PrettyLogger {
  private logger: Logger;

  constructor() {
    this.logger = prettyLogger;
  }

  info(message: string): void {
    this.logger.info(message);
  }

  warn(message: string): void {
    this.logger.warn(`⚠️  ${message}`);
  }

  error(message: string): void {
    this.logger.error(`❌ ${message}`);
  }

  debug(message: string): void {
    this.logger.debug(`🔍 ${message}`);
  }

  fatal(message: string): void {
    this.logger.fatal(`💀 ${message}`);
  }

  command(sender: string, command: string, args: string[] = []): void {
    const senderDisplay = this.formatSender(sender);
    const argsDisplay = args.length > 0 ? ` ${args.join(' ')}` : '';
    this.logger.info(`[${senderDisplay}] ➜ ${config.prefix}${command}${argsDisplay}`);
  }

  downloader(service: string, url: string, status: string, extra?: string): void {
    const icons = {
      START: '⬇️',
      SUCCESS: '✅',
      FAILED: '❌',
      RETRY: '🔄',
    };
    const icon = icons[status as keyof typeof icons] || '📥';
    const shortUrl = this.shortenUrl(url);
    const extraInfo = extra ? ` | ${extra}` : '';
    this.logger.info(`${icon} [${service.toUpperCase()}] ${status} - ${shortUrl}${extraInfo}`);
  }

  private formatSender(sender: string): string {
    if (!sender) return 'Unknown';
    const clean = sender.replace(/@.*$/, '').replace(/[^0-9]/g, '');
    
    if (clean.length >= 10) {
      const last4 = clean.slice(-4);
      const first4 = clean.slice(0, 4);
      return `+${first4}...${last4}`;
    }
    
    return clean || 'Unknown';
  }

  private shortenUrl(url: string, maxLength = 60): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  }
}

export default new PrettyLogger();