// src/utils/logger.ts
import pino, { Logger, LoggerOptions } from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';

interface TransportConfig {
  readonly target: string;
  readonly level: string;
  readonly options?: Record<string, unknown>;
}

function setupLogDirectory(): string {
  const logDir = path.dirname(path.resolve(config.logFileCombined));
  
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
      console.info(`📁 Created log directory: ${logDir}`);
    }
    
    const testFile = path.join(logDir, '.write-test');
    fs.writeFileSync(testFile, 'test', { flag: 'w' });
    fs.unlinkSync(testFile);
    
    return logDir;
  } catch (error) {
    console.error('Failed to setup log directory:', error);
    throw new Error(`Cannot access log directory: ${logDir}`);
  }
}

function buildTransports(logDir: string): TransportConfig[] {
  const transports: TransportConfig[] = [
    {
      target: 'pino-pretty',
      level: config.logLevel,
      options: {
        colorize: config.logPretty && !config.isProduction,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: config.isProduction,
        messageFormat: '{module} {msg}',
      },
    },
  ];

  if (config.isProduction) {
    transports.push(
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: config.logFileCombined,
          mkdir: true,
        },
      },
      {
        target: 'pino/file',
        level: 'error',
        options: {
          destination: config.logFileError,
          mkdir: true,
        },
      },
    );
  }

  return transports;
}

const logDir = setupLogDirectory();

const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'maple-bot',
    env: config.isProduction ? 'production' : 'development',
  },
  redact: {
    paths: [
      'password', 
      'token', 
      'secret', 
      'authorization',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.sessionPassword',
    ],
    censor: '[REDACTED]',
  },
};

export const logger: Logger = pino(loggerOptions, pino.transport({
  targets: buildTransports(logDir),
}));

export const baileysLogger: Logger = logger.child({ 
  module: 'baileys',
});

baileysLogger.level = config.baileysLogLevel;

// Type definitions
type DownloadService = 'tiktok' | 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'general';
type DownloadStatus = 'START' | 'SUCCESS' | 'FAILED' | 'RETRY';
type AnimeFeature = 'info' | 'trace' | 'wallpaper' | 'search' | 'download';
type ScraperType = 'anime' | 'manga' | 'downloader' | 'api';

interface CommandLogContext {
  readonly sender: string;
  readonly command: string;
  readonly args: readonly string[];
}

interface ScraperLogContext {
  readonly scraper: string;
  readonly operation: string;
  readonly status: 'success' | 'failed' | 'timeout';
  readonly duration?: number;
}

export const logHelper = {
  command(context: CommandLogContext): void {
    const { sender, command, args } = context;
    const argString = args.length > 0 ? ` ${args.join(' ')}` : '';
    logger.info(
      { sender, command, args: [...args] },
      `[CMD] ${sender} -> ${config.prefix}${command}${argString}`,
    );
  },

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

  anime(feature: AnimeFeature, query: string): void {
    logger.info(
      { feature, query },
      `[ANIME:${feature.toUpperCase()}] ${query}`,
    );
  },

  scraper(context: ScraperLogContext): void {
    const { scraper, operation, status, duration } = context;
    const durationStr = duration ? ` | ${duration}ms` : '';
    logger.info(
      { scraper, operation, status, duration },
      `[SCRAPER:${scraper}] [${operation}] ${status}${durationStr}`,
    );
  },

  error(context: string, error: unknown): void {
    if (error instanceof Error) {
      logger.error(
        { 
          err: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause,
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

  warn(context: string, message: string): void {
    logger.warn(
      { context },
      `[WARN:${context}] ${message}`,
    );
  },

  debug(context: string, message: string, data?: unknown): void {
    logger.debug(
      { context, data },
      `[DEBUG:${context}] ${message}`,
    );
  },

  fatal(context: string, error: unknown): void {
    if (error instanceof Error) {
      logger.fatal(
        { 
          err: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          context,
        },
        `[FATAL:${context}] ${error.message}`,
      );
    } else {
      logger.fatal(
        { err: String(error), context },
        `[FATAL:${context}] ${String(error)}`,
      );
    }
  },
};

export type { Logger, TransportConfig, CommandLogContext, ScraperLogContext, DownloadService, DownloadStatus };