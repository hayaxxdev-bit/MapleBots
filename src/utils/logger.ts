// src/utils/logger.ts
import pino, { Logger, LoggerOptions } from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

/**
 * Interface untuk transport configuration.
 */
interface TransportConfig {
  readonly target: string;
  readonly level: string;
  readonly options?: Record<string, unknown>;
}

/**
 * Setup direktori log dan validasi permissions.
 */
function setupLogDirectory(): string {
  const logDir = path.join(process.cwd(), 'logs');
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
      console.info(`📁 Created log directory: ${logDir}`);
    }
    
    // Test write permission
    const testFile = path.join(logDir, '.write-test');
    fs.writeFileSync(testFile, 'test', { flag: 'w' });
    fs.unlinkSync(testFile);
    
    return logDir;
  } catch (error) {
    console.error('Failed to setup log directory:', error);
    throw new Error(`Cannot access log directory: ${logDir}`);
  }
}

/**
 * Build transport configurations based on environment.
 */
function buildTransports(logDir: string): TransportConfig[] {
  const transports: TransportConfig[] = [
    // Console output with pretty formatting
    {
      target: 'pino-pretty',
      level: config.logLevel,
      options: {
        colorize: !config.isProduction,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: config.isProduction,
      },
    },
  ];

  // File transports only in production
  if (config.isProduction) {
    transports.push(
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: path.join(logDir, 'combined.log'),
          mkdir: true,
        },
      },
      {
        target: 'pino/file',
        level: 'error',
        options: {
          destination: path.join(logDir, 'error.log'),
          mkdir: true,
        },
      },
    );
  }

  return transports;
}

// Setup log directory
const logDir = setupLogDirectory();

/**
 * Build logger options.
 */
const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'maple-bot',
    env: config.isProduction ? 'production' : 'development',
  },
  redact: {
    paths: ['password', 'token', 'secret', 'authorization'],
    censor: '[REDACTED]',
  },
};

/**
 * Create main logger instance.
 */
export const logger: Logger = pino(loggerOptions, pino.transport({
  targets: buildTransports(logDir),
}));

/**
 * Logger khusus untuk Baileys dengan level yang lebih tinggi.
 */
export const baileysLogger: Logger = logger.child({ 
  module: 'baileys',
});

// Set Baileys logger level
baileysLogger.level = config.baileysLogLevel;

/**
 * Type definitions untuk log helper methods.
 */
type DownloadService = 'tiktok' | 'youtube' | 'instagram' | 'facebook' | 'general';
type DownloadStatus = 'START' | 'SUCCESS' | 'FAILED';
type AnimeFeature = 'info' | 'trace' | 'wallpaper';

interface CommandLogContext {
  readonly sender: string;
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * Helper utilities untuk mencatat log aktivitas Bot secara konsisten.
 */
export const logHelper = {
  /**
   * Log saat user menjalankan command.
   * @param context - Command context information
   */
  command(context: CommandLogContext): void {
    const { sender, command, args } = context;
    const argString = args.length > 0 ? ` ${args.join(' ')}` : '';
    logger.info(
      { sender, command, args: [...args] },
      `[CMD] ${sender} -> ${config.prefix}${command}${argString}`,
    );
  },

  /**
   * Log aktivitas downloader.
   * @param service - Nama service downloader
   * @param url - URL yang diproses
   * @param status - Status operasi
   * @param extraInfo - Informasi tambahan (opsional)
   */
  downloader(
    service: DownloadService,
    url: string,
    status: DownloadStatus,
    extraInfo?: string,
  ): void {
    const detail = extraInfo ? ` | ${extraInfo}` : '';
    logger.info(
      { service, url, status },
      `[DOWNLOADER:${service.toUpperCase()}] [${status}] ${url}${detail}`,
    );
  },

  /**
   * Log aktivitas fitur anime.
   * @param feature - Nama fitur anime
   * @param query - Query atau informasi yang diproses
   */
  anime(feature: AnimeFeature, query: string): void {
    logger.info(
      { feature, query },
      `[ANIME:${feature.toUpperCase()}] ${query}`,
    );
  },

  /**
   * Log penanganan error dengan konteks yang jelas.
   * @param context - Konteks error (misal: 'download', 'api-call')
   * @param error - Error object atau unknown error
   */
  error(context: string, error: unknown): void {
    if (error instanceof Error) {
      logger.error(
        { 
          err: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          context,
        },
        `[ERROR:${context}] ${error.message}`,
      );
    } else {
      logger.error(
        { err: String(error), context },
        `[ERROR:${context}] ${String(error)}`,
      );
    }
  },

  /**
   * Log warning dengan konteks.
   * @param context - Konteks warning
   * @param message - Warning message
   */
  warn(context: string, message: string): void {
    logger.warn(
      { context },
      `[WARN:${context}] ${message}`,
    );
  },
};

// Export types for use in other modules
export type { Logger, TransportConfig, CommandLogContext };