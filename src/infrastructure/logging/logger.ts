import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';
import fs from 'node:fs';
import path from 'node:path';

import { config } from '../../config/config';

/* ============================================================
 * TYPES
 * ============================================================ */

interface TransportConfig {
  readonly target: string;
  readonly level: string;
  readonly options?: Record<string, unknown>;
}

type DownloadService =
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'pinterest'
  | 'general';

type DownloadStatus =
  | 'START'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRY';

type AnimeFeature =
  | 'info'
  | 'trace'
  | 'wallpaper'
  | 'search'
  | 'download';

type ChatType =
  | 'private'
  | 'group'
  | 'broadcast'
  | 'status';

type ScraperType =
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'pinterest'
  | 'general';

interface CommandLogContext {
  readonly sender: string;
  readonly command: string;
  readonly args: readonly string[];
}

interface ScraperLogContext {
  readonly scraper: string;
  readonly operation: string;
  readonly status:
    | 'success'
    | 'failed'
    | 'timeout';
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

/* ============================================================
 * ANSI COLORS & STYLES
 * ============================================================ */

const isDevelopment = !config.isProduction;
const isTTY = process.stdout.isTTY && isDevelopment;

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgBrightBlack: '\x1b[100m',
  bgBrightRed: '\x1b[101m',
  bgBrightGreen: '\x1b[102m',
  bgBrightYellow: '\x1b[103m',
  bgBrightBlue: '\x1b[104m',
  bgBrightMagenta: '\x1b[105m',
  bgBrightCyan: '\x1b[106m',
  bgBrightWhite: '\x1b[107m',
} as const;

type Color = keyof typeof colors;

function colorize(text: string, color: Color): string {
  if (!isTTY) {
    return text;
  }
  return `${colors[color]}${text}${colors.reset}`;
}

function bold(text: string): string {
  if (!isTTY) {
    return text;
  }
  return `${colors.bold}${text}${colors.reset}`;
}

function dim(text: string): string {
  if (!isTTY) {
    return text;
  }
  return `${colors.dim}${text}${colors.reset}`;
}

function badge(text: string, bgColor: Color, textColor: Color = 'brightWhite'): string {
  if (!isTTY) {
    return text;
  }
  const padding = ' ';
  return `${colors[bgColor]}${colors[textColor]}${colors.bold}${padding}${text}${padding}${colors.reset}`;
}

function separator(char: string = '─', length: number = 60): string {
  return colorize(char.repeat(length), 'brightBlack');
}

/* ============================================================
 * LOG DIRECTORY
 * ============================================================ */

function setupLogDirectory(): string {
  const logDir = path.dirname(
    path.resolve(config.logFileCombined),
  );

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, {
        recursive: true,
        mode: 0o755,
      });

      console.info(
        `📁 Created log directory: ${logDir}`,
      );
    }

    const testFile = path.join(
      logDir,
      '.write-test',
    );

    fs.writeFileSync(testFile, 'test', {
      flag: 'w',
    });

    fs.unlinkSync(testFile);

    return logDir;
  } catch (error) {
    console.error(
      'Failed to setup log directory:',
      error,
    );

    throw new Error(
      `Cannot access log directory: ${logDir}`,
    );
  }
}

/* ============================================================
 * PRETTY COLORS CONFIG
 * ============================================================ */

const PRETTY_COLORS = [
  'trace:gray',
  'debug:green',
  'info:blue',
  'warn:yellow',
  'error:red',
  'fatal:magenta',
].join(',');

const PRETTY_LEVELS = [
  'trace:10',
  'debug:20',
  'info:30',
  'warn:40',
  'error:50',
  'fatal:60',
].join(',');

/* ============================================================
 * TRANSPORTS
 * ============================================================ */

function buildTransports(
  _logDir: string,
): TransportConfig[] {
  const transports: TransportConfig[] = [
    {
      target: 'pino-pretty',
      level: config.logLevel,
      options: {
        colorize: isTTY,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,module,context,type,service,env',
        singleLine: !isDevelopment,
        levelFirst: true,
        messageFormat: isDevelopment ? '{msg}' : '[{level}] {msg}',
        customColors: PRETTY_COLORS,
        customLevels: PRETTY_LEVELS,
        hideObject: true,
      },
    },
  ];

  /*
   * Production:
   *
   * INFO+  -> combined.log
   * ERROR+ -> error.log
   */
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

/* ============================================================
 * LOGGER
 * ============================================================ */

const logDir = setupLogDirectory();

const loggerOptions: LoggerOptions = {
  level: config.logLevel,

  timestamp: pino.stdTimeFunctions.isoTime,

  base: {
    service: 'maple-bot',
    env: config.isProduction
      ? 'production'
      : 'development',
  },

  /*
   * Never expose secrets in logs.
   */
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
      '*.accessToken',
      '*.refreshToken',
      '*.cookie',
    ],

    censor: '[REDACTED]',
  },
};

export const logger: Logger = pino(
  loggerOptions,
  pino.transport({
    targets: buildTransports(logDir),
  }) as unknown as DestinationStream,
);

/*
 * Dedicated Baileys logger.
 */
export const baileysLogger = logger.child({
  module: 'baileys',
});

baileysLogger.level = config.baileysLogLevel;

/* ============================================================
 * FORMAT HELPERS
 * ============================================================ */

function cleanNumber(
  value?: string,
): string {
  if (!value) {
    return '';
  }

  return value.replace(
    /[^0-9]/g,
    '',
  );
}

function displayNumber(
  value?: string,
): string {
  const number = cleanNumber(value);

  if (!number) {
    return 'Unknown';
  }

  if (number.length <= 8) {
    return number;
  }

  return `+${number.slice(0, 4)}...${number.slice(-4)}`;
}

function displayName(
  value?: string,
): string {
  const name = value?.trim();

  if (!name) {
    return '';
  }

  return name;
}

function shorten(
  value: string,
  maxLength: number,
): string {
  const normalized = value
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return (
    normalized.slice(
      0,
      maxLength - 3,
    ) + '...'
  );
}

function formatDuration(
  duration?: number,
): string {
  if (typeof duration !== 'number') {
    return '';
  }

  return ` | ${duration}ms`;
}

function formatStatus(
  status: string,
): string {
  return status
    .trim()
    .toUpperCase();
}

/* ============================================================
 * ICONS
 * ============================================================ */

const DOWNLOAD_ICONS: Record<
  DownloadStatus,
  string
> = {
  START: '⬇️',
  SUCCESS: '✅',
  FAILED: '❌',
  RETRY: '🔄',
};

const CONNECTION_ICONS: Record<
  string,
  string
> = {
  OPEN: '🟢',
  CONNECTED: '🟢',
  ONLINE: '🟢',
  CONNECTING: '🟡',
  RECONNECTING: '🔄',
  CLOSE: '🔴',
  CLOSED: '🔴',
  OFFLINE: '⚫',
  ERROR: '❌',
  LOGGED_OUT: '🚪',
};

/* ============================================================
 * LOG HELPERS
 * ============================================================ */

export const logHelper = {
  /**
   * Command execution.
   */
  command(context: CommandLogContext): void {
    const { sender, command, args } = context;

    const senderNumber = cleanNumber(sender);
    const argString = args.length > 0 ? ` ${args.join(' ')}` : '';
    const senderDisplay = displayNumber(sender);

    const message = `${badge('COMMAND', 'bgBrightBlue', 'brightWhite')} ${colorize(senderDisplay, 'yellow')} ${dim('→')} ${bold(`${config.prefix}${command}`)}${dim(argString)}`;

    logger.info(
      {
        sender,
        senderNumber,
        command,
        args: [...args],
        type: 'command',
      },
      message,
    );
  },

  /**
   * Downloader activity.
   */
  downloader(
    service: DownloadService,
    url: string,
    status: DownloadStatus,
    extraInfo?: string,
  ): void {
    const normalizedStatus = formatStatus(status) as DownloadStatus;
    const icon = DOWNLOAD_ICONS[normalizedStatus] ?? '📥';
    const shortUrl = shorten(url, 60);
    const detail = extraInfo ? ` | ${extraInfo}` : '';

    const statusColors: Record<DownloadStatus, Color> = {
      START: 'bgBrightBlue',
      SUCCESS: 'bgBrightGreen',
      FAILED: 'bgBrightRed',
      RETRY: 'bgBrightYellow',
    };

    const statusTextColors: Record<DownloadStatus, Color> = {
      START: 'brightWhite',
      SUCCESS: 'brightWhite',
      FAILED: 'brightWhite',
      RETRY: 'brightBlack',
    };

    const message = `${badge(normalizedStatus, statusColors[normalizedStatus], statusTextColors[normalizedStatus])} ${colorize(service.toUpperCase(), 'cyan')} ${dim('→')} ${shortUrl}${detail}`;

    logger.info(
      {
        service,
        url: shortUrl,
        status: normalizedStatus,
        type: 'downloader',
      },
      message,
    );
  },

  /**
   * Anime feature.
   */
  anime(feature: AnimeFeature, query: string): void {
    const message = `${badge('ANIME', 'bgBrightMagenta', 'brightWhite')} ${colorize(feature.toUpperCase(), 'cyan')} ${dim('→')} ${shorten(query, 100)}`;

    logger.info(
      {
        feature,
        query,
        type: 'anime',
      },
      message,
    );
  },

  /**
   * Scraper operation.
   */
  scraper(context: ScraperLogContext): void {
    const { scraper, operation, status, duration } = context;

    const normalizedStatus = status.toUpperCase();
    const icon = normalizedStatus === 'SUCCESS' ? '✅' : normalizedStatus === 'TIMEOUT' ? '⏱️' : '❌';

    const message = `${icon} ${colorize(scraper.toUpperCase(), 'cyan')} ${dim('→')} ${operation} ${dim('→')} ${colorize(normalizedStatus, normalizedStatus === 'SUCCESS' ? 'brightGreen' : 'brightRed')}${formatDuration(duration)}`;

    logger.info(
      {
        scraper,
        operation,
        status,
        duration,
        type: 'scraper',
      },
      message,
    );
  },

  /**
   * Incoming WhatsApp message.
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

    const senderNumber = cleanNumber(sender);
    const shortText = shorten(text, 100);
    const name = displayName(senderName);
    const senderDisplay = displayNumber(sender);

    if (chatType === 'group') {
      const message = `${badge('GROUP', 'bgBrightMagenta', 'brightWhite')} ${colorize(groupName || 'Unknown', 'cyan')} ${dim('→')} ${colorize(senderDisplay, 'yellow')}${name ? ` ${dim(`(${name})`)}` : ''} ${dim('→')} ${messageType}: ${shortText}`;

      logger.info(
        {
          chatId,
          groupId: groupId || chatId,
          groupName: groupName || 'Unknown Group',
          sender,
          senderNumber,
          senderName: name || 'Unknown',
          messageType,
          isCommand,
          type: 'incoming-group-message',
        },
        message,
      );

      return;
    }

    if (chatType === 'private') {
      const message = `${badge('PRIVATE', 'bgBrightCyan', 'brightWhite')} ${colorize(senderDisplay, 'yellow')}${name ? ` ${dim(`(${name})`)}` : ''} ${dim('→')} ${messageType}: ${shortText}`;

      logger.info(
        {
          chatId,
          sender,
          senderNumber,
          senderName: name || 'Unknown',
          messageType,
          isCommand,
          type: 'incoming-private-message',
        },
        message,
      );

      return;
    }

    logger.debug(
      {
        chatId,
        sender,
        chatType,
        messageType,
        type: 'incoming-other-message',
      },
      `📥 [${chatType.toUpperCase()}] ${messageType}: ${shortText}`,
    );
  },

  /**
   * Group events.
   */
  groupEvent(context: GroupLogContext): void {
    const { groupId, groupName, action, participant, actor } = context;

    const participantNumber = cleanNumber(participant);
    const actorNumber = cleanNumber(actor);
    const group = groupName || groupId;
    const participantDisplay = participantNumber ? displayNumber(participantNumber) : 'Unknown';
    const actorDisplay = actorNumber ? ` | By: ${displayNumber(actorNumber)}` : '';

    const message = `${badge('GROUP EVENT', 'bgBrightBlue', 'brightWhite')} ${colorize(group, 'cyan')} ${dim('→')} ${action} ${dim('→')} ${colorize(participantDisplay, 'yellow')}${actorDisplay}`;

    logger.info(
      {
        groupId,
        groupName: groupName || 'Unknown',
        action,
        participant: participantNumber,
        actor: actorNumber,
        type: 'group-event',
      },
      message,
    );
  },

  /**
   * Bot outgoing message.
   */
  outgoingMessage(
    chatId: string,
    chatType: ChatType,
    messageType: string,
    content: string,
  ): void {
    const shortContent = shorten(content, 100);
    const number = cleanNumber(chatId);

    const message = `${badge('OUTGOING', 'bgBrightGreen', 'brightWhite')} ${colorize(chatType.toUpperCase(), 'cyan')} ${dim('→')} ${colorize(number || chatId, 'yellow')} ${dim('→')} ${messageType}: ${shortContent}`;

    logger.info(
      {
        chatId,
        chatType,
        messageType,
        type: 'outgoing-message',
      },
      message,
    );
  },

  /**
   * Connection state.
   */
  connection(status: string, details?: string): void {
    const normalized = formatStatus(status);
    const icon = CONNECTION_ICONS[normalized] ?? '🔌';
    const detail = details ? ` | ${details}` : '';

    const statusColors: Record<string, Color> = {
      OPEN: 'bgBrightGreen',
      CONNECTED: 'bgBrightGreen',
      ONLINE: 'bgBrightGreen',
      CONNECTING: 'bgBrightYellow',
      RECONNECTING: 'bgBrightYellow',
      CLOSE: 'bgBrightRed',
      CLOSED: 'bgBrightRed',
      OFFLINE: 'bgBrightBlack',
      ERROR: 'bgBrightRed',
      LOGGED_OUT: 'bgBrightRed',
    };

    const statusTextColors: Record<string, Color> = {
      OPEN: 'brightWhite',
      CONNECTED: 'brightWhite',
      ONLINE: 'brightWhite',
      CONNECTING: 'brightBlack',
      RECONNECTING: 'brightBlack',
      CLOSE: 'brightWhite',
      CLOSED: 'brightWhite',
      OFFLINE: 'brightWhite',
      ERROR: 'brightWhite',
      LOGGED_OUT: 'brightWhite',
    };

    const bgColor = statusColors[normalized] ?? 'bgBrightBlack';
    const textColor = statusTextColors[normalized] ?? 'brightWhite';

    const message = `${badge(normalized, bgColor, textColor)}${detail}`;

    logger.info(
      {
        status,
        details,
        type: 'connection',
      },
      message,
    );
  },

  /**
   * Error.
   */
  error(context: string, error: unknown): void {
    if (error instanceof Error) {
      const message = `${badge('ERROR', 'bgBrightRed', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${colorize(error.message, 'brightRed')}`;

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
        message,
      );

      return;
    }

    const message = `${badge('ERROR', 'bgBrightRed', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${colorize(String(error), 'brightRed')}`;

    logger.error(
      {
        err: String(error),
        context,
        type: 'error',
      },
      message,
    );
  },

  /**
   * Warning.
   */
  warn(context: string, message: string): void {
    const formattedMessage = `${badge('WARN', 'bgBrightYellow', 'brightBlack')} ${colorize(context, 'cyan')} ${dim('→')} ${message}`;

    logger.warn(
      {
        context,
        type: 'warning',
      },
      formattedMessage,
    );
  },

  /**
   * Info.
   */
  info(context: string, message: string): void {
    const formattedMessage = `${badge('INFO', 'bgBrightBlue', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${message}`;

    logger.info(
      {
        context,
        type: 'info',
      },
      formattedMessage,
    );
  },

  /**
   * Debug.
   */
  debug(context: string, message: string, data?: unknown): void {
    const formattedMessage = `${badge('DEBUG', 'bgBrightGreen', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${message}`;

    logger.debug(
      {
        context,
        data,
        type: 'debug',
      },
      formattedMessage,
    );
  },

  /**
   * Fatal.
   */
  fatal(context: string, error: unknown): void {
    if (error instanceof Error) {
      const message = `${badge('FATAL', 'bgBrightMagenta', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${colorize(error.message, 'brightMagenta')}`;

      logger.fatal(
        {
          err: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause,
          },
          context,
          type: 'fatal',
        },
        message,
      );

      return;
    }

    const message = `${badge('FATAL', 'bgBrightMagenta', 'brightWhite')} ${colorize(context, 'cyan')} ${dim('→')} ${colorize(String(error), 'brightMagenta')}`;

    logger.fatal(
      {
        err: String(error),
        context,
        type: 'fatal',
      },
      message,
    );
  },
};

/* ============================================================
 * EXPORTS
 * ============================================================ */

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