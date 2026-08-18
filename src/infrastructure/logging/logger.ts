// src/utils/logger.ts
import pino, { Logger, LoggerOptions, DestinationStream } from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/config';

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

function buildTransports(_logDir: string): TransportConfig[] {
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
      }
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

export const logger: Logger = pino(
  loggerOptions,
  pino.transport({
    targets: buildTransports(logDir),
  }) as unknown as DestinationStream
);

export const baileysLogger: Logger = logger.child({
  module: 'baileys',
});

baileysLogger.level = config.baileysLogLevel;

// ============================================
// Type Definitions
// ============================================

type DownloadService =
  'tiktok' | 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'pinterest' | 'general';
type DownloadStatus = 'START' | 'SUCCESS' | 'FAILED' | 'RETRY';
type AnimeFeature = 'info' | 'trace' | 'wallpaper' | 'search' | 'download';
type ChatType = 'private' | 'group' | 'broadcast' | 'status';
type ScraperType =
  'tiktok' | 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'pinterest' | 'general';

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

interface MessageLogContext {
  readonly chatId: string;
  readonly sender: string;
  readonly senderName?: string;
  readonly chatType: ChatType;
  readonly groupName?: string;
  readonly groupId?: string;
  readonly messageType: string;
  readonly text: string;
  readonly isCommand: boolean;
  readonly timestamp: Date;
}

interface GroupLogContext {
  readonly groupId: string;
  readonly groupName?: string;
  readonly action: string;
  readonly participant?: string;
  readonly actor?: string;
}

/**
 * Helper utilities untuk mencatat log aktivitas Bot secara konsisten.
 */
export const logHelper = {
  /**
   * Log saat user menjalankan command.
   */
  command(context: CommandLogContext): void {
    const { sender, command, args } = context;
    const senderNumber = sender.replace(/[^0-9]/g, '');
    const argString = args.length > 0 ? ` ${args.join(' ')}` : '';

    logger.info(
      {
        sender,
        senderNumber,
        command,
        args: [...args],
        type: 'command',
      },
      `[CMD] ${senderNumber} -> ${config.prefix}${command}${argString}`
    );
  },

  /**
   * Log aktivitas downloader.
   */
  downloader(
    service: DownloadService,
    url: string,
    status: DownloadStatus,
    extraInfo?: string
  ): void {
    const detail = extraInfo ? ` | ${extraInfo}` : '';
    const shortUrl = url.length > 50 ? url.substring(0, 50) + '...' : url;

    logger.info(
      {
        service,
        url: shortUrl,
        status,
        type: 'downloader',
      },
      `[DOWNLOADER:${service.toUpperCase()}] [${status}] ${shortUrl}${detail}`
    );
  },

  /**
   * Log aktivitas fitur anime.
   */
  anime(feature: AnimeFeature, query: string): void {
    logger.info({ feature, query, type: 'anime' }, `[ANIME:${feature.toUpperCase()}] ${query}`);
  },

  /**
   * Log scraper operations.
   */
  scraper(context: ScraperLogContext): void {
    const { scraper, operation, status, duration } = context;
    const durationStr = duration ? ` | ${duration}ms` : '';

    logger.info(
      { scraper, operation, status, duration, type: 'scraper' },
      `[SCRAPER:${scraper}] [${operation}] ${status}${durationStr}`
    );
  },

  /**
   * Log incoming message (PENTING - untuk tracking chat).
   */
  incomingMessage(context: MessageLogContext): void {
    const {
      chatId,
      sender,
      senderName,
      chatType,
      groupName,
      groupId,
      messageType,
      text,
      isCommand,
    } = context;

    const senderNumber = sender.replace(/[^0-9]/g, '');
    const shortText = text.length > 100 ? text.substring(0, 100) + '...' : text;

    if (chatType === 'group') {
      // Log untuk pesan grup
      logger.info(
        {
          chatId,
          groupId: groupId || chatId,
          groupName: groupName || 'Unknown Group',
          sender,
          senderNumber,
          senderName: senderName || 'Unknown',
          messageType,
          isCommand,
          type: 'incoming-group-message',
        },
        `[GRUP: ${groupName || 'Unknown'}] [${senderNumber}${senderName ? ` (${senderName})` : ''}] ${messageType}: ${shortText}`
      );
    } else if (chatType === 'private') {
      // Log untuk pesan pribadi
      logger.info(
        {
          chatId,
          sender,
          senderNumber,
          senderName: senderName || 'Unknown',
          messageType,
          isCommand,
          type: 'incoming-private-message',
        },
        `[PRIVATE: ${senderNumber}${senderName ? ` (${senderName})` : ''}] ${messageType}: ${shortText}`
      );
    } else {
      // Log untuk pesan lain (broadcast, status)
      logger.debug(
        {
          chatId,
          sender,
          chatType,
          messageType,
          type: 'incoming-other-message',
        },
        `[${chatType.toUpperCase()}] ${messageType}: ${shortText}`
      );
    }
  },

  /**
   * Log group events (member join, leave, dll).
   */
  groupEvent(context: GroupLogContext): void {
    const { groupId, groupName, action, participant, actor } = context;

    const participantNumber = participant?.replace(/[^0-9]/g, '') || '';
    const actorNumber = actor?.replace(/[^0-9]/g, '') || '';

    logger.info(
      {
        groupId,
        groupName: groupName || 'Unknown',
        action,
        participant: participantNumber,
        actor: actorNumber,
        type: 'group-event',
      },
      `[GROUP EVENT] ${groupName || groupId} | ${action} | Member: ${participantNumber}${actorNumber ? ` | By: ${actorNumber}` : ''}`
    );
  },

  /**
   * Log bot response (ketika bot mengirim pesan).
   */
  outgoingMessage(chatId: string, chatType: ChatType, messageType: string, content: string): void {
    const shortContent = content.length > 100 ? content.substring(0, 100) + '...' : content;

    logger.info(
      {
        chatId,
        chatType,
        messageType,
        type: 'outgoing-message',
      },
      `[BOT REPLY -> ${chatType.toUpperCase()}: ${chatId.replace(/[^0-9]/g, '')}] ${messageType}: ${shortContent}`
    );
  },

  /**
   * Log connection status.
   */
  connection(status: string, details?: string): void {
    const detailStr = details ? ` | ${details}` : '';
    logger.info({ status, details, type: 'connection' }, `[CONNECTION] ${status}${detailStr}`);
  },

  /**
   * Log error dengan konteks yang jelas.
   */
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
          type: 'error',
        },
        `[ERROR:${context}] ${error.message}`
      );
    } else {
      logger.error(
        { err: String(error), context, type: 'error' },
        `[ERROR:${context}] ${String(error)}`
      );
    }
  },

  /**
   * Log warning dengan konteks.
   */
  warn(context: string, message: string): void {
    logger.warn({ context, type: 'warning' }, `[WARN:${context}] ${message}`);
  },

  info(context: string, message: string): void {
    logger.info({ context, type: 'info' }, `[INFO:${context}] ${message}`);
  },

  /**
   * Log debug.
   */
  debug(context: string, message: string, data?: unknown): void {
    logger.debug({ context, data, type: 'debug' }, `[DEBUG:${context}] ${message}`);
  },

  /**
   * Log fatal error.
   */
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
          type: 'fatal',
        },
        `[FATAL:${context}] ${error.message}`
      );
    } else {
      logger.fatal(
        { err: String(error), context, type: 'fatal' },
        `[FATAL:${context}] ${String(error)}`
      );
    }
  },
};

export type {
  Logger,
  TransportConfig,
  CommandLogContext,
  ScraperLogContext,
  MessageLogContext,
  GroupLogContext,
  DownloadService,
  DownloadStatus,
  ChatType,
  ScraperType,
};
