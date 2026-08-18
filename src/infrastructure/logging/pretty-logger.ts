// src/utils/pretty-logger.ts

import pino, { type DestinationStream, type Logger } from 'pino';
import { config } from '../../config/config';

const RESET = '\x1b[0m';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
} as const;

function color(
  value: string,
  colorCode: string,
): string {
  return `${colorCode}${value}${RESET}`;
}

function now(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Low-level Pino logger.
 *
 * Tetap digunakan untuk structured logging.
 */
export const prettyLogger: Logger = pino(
  {
    level: config.logLevel,

    timestamp: () =>
      `,"time":"${now()}"`,

    base: undefined,

    formatters: {
      level(label) {
        return {
          level: label.toUpperCase(),
        };
      },
    },
  },

  pino.transport({
    target: 'pino-pretty',

    options: {
      colorize: true,
      translateTime: false,
      ignore: 'pid,hostname',
      singleLine: true,
      messageFormat: '{msg}',

      customColors:
        'INFO:blue,WARN:yellow,ERROR:red,DEBUG:green,TRACE:cyan,FATAL:magenta',
    },
  }) as unknown as DestinationStream,
);

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type HealthState =
  | 'healthy'
  | 'degraded'
  | 'unhealthy';

export class PrettyLogger {
  private readonly logger: Logger;

  constructor(logger: Logger = prettyLogger) {
    this.logger = logger;
  }

  /**
   * Generic information.
   */
  info(message: string): void {
    this.logger.info(message);
  }

  /**
   * Success message.
   */
  success(message: string): void {
    this.logger.info(
      `${color('✔', COLORS.green)} ${color(message, COLORS.green)}`,
    );
  }

  /**
   * Warning.
   */
  warn(message: string, details?: string): void {
    const output = details
      ? `${message} ${color(`· ${details}`, COLORS.gray)}`
      : message;

    this.logger.warn(
      `${color('⚠', COLORS.yellow)} ${output}`,
    );
  }

  /**
   * Error.
   */
  error(message: string, details?: string): void {
    const output = details
      ? `${message} ${color(`· ${details}`, COLORS.gray)}`
      : message;

    this.logger.error(
      `${color('✖', COLORS.red)} ${output}`,
    );
  }

  /**
   * Debug.
   */
  debug(message: string): void {
    this.logger.debug(
      `${color('◆', COLORS.green)} ${message}`,
    );
  }

  /**
   * Trace.
   */
  trace(message: string): void {
    this.logger.trace(
      `${color('◇', COLORS.cyan)} ${message}`,
    );
  }

  /**
   * Fatal.
   */
  fatal(message: string): void {
    this.logger.fatal(
      `${color('☠', COLORS.magenta)} ${message}`,
    );
  }

  /**
   * Generic event.
   *
   * Example:
   *
   * pretty.event(
   *   'whatsapp',
   *   'Initializing connection',
   * );
   */
  event(
    category: string,
    message: string,
  ): void {
    const label = category
      .trim()
      .toUpperCase();

    this.logger.info(
      `${color('◆', COLORS.cyan)} ${color(
        `[${label}]`,
        COLORS.cyan,
      )} ${message}`,
    );
  }

  /**
   * WhatsApp connection state.
   */
  connection(
    state: ConnectionState,
    details?: string,
  ): void {
    const styles: Record<
      ConnectionState,
      {
        icon: string;
        color: string;
      }
    > = {
      connecting: {
        icon: '◌',
        color: COLORS.yellow,
      },

      connected: {
        icon: '●',
        color: COLORS.green,
      },

      reconnecting: {
        icon: '↻',
        color: COLORS.yellow,
      },

      disconnected: {
        icon: '○',
        color: COLORS.red,
      },
    };

    const style = styles[state];

    const output = [
      color(style.icon, style.color),
      color(
        `[WHATSAPP] ${state.toUpperCase()}`,
        style.color,
      ),
      details
        ? color(`· ${details}`, COLORS.gray)
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    this.logger.info(output);
  }

  /**
   * Health status.
   */
  health(
    service: string,
    status: HealthState,
    details?: string,
  ): void {
    const colors: Record<
      HealthState,
      string
    > = {
      healthy: COLORS.green,
      degraded: COLORS.yellow,
      unhealthy: COLORS.red,
    };

    const icons: Record<
      HealthState,
      string
    > = {
      healthy: '●',
      degraded: '◐',
      unhealthy: '○',
    };

    const output = [
      color(icons[status], colors[status]),
      color(
        `[${service.toUpperCase()}]`,
        colors[status],
      ),
      color(
        status.toUpperCase(),
        colors[status],
      ),
      details
        ? color(`· ${details}`, COLORS.gray)
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    this.logger.info(output);
  }

  /**
   * Command execution.
   */
  command(
    sender: string,
    command: string,
    args: string[] = [],
  ): void {
    const senderDisplay =
      this.formatSender(sender);

    const argsDisplay =
      args.length > 0
        ? ` ${args.join(' ')}`
        : '';

    this.logger.info(
      `${color('➜', COLORS.cyan)} ` +
        `${color(
          `[${senderDisplay}]`,
          COLORS.gray,
        )} ` +
        `${color(
          `${config.prefix}${command}`,
          COLORS.green,
        )}` +
        `${argsDisplay}`,
    );
  }

  /**
   * Downloader status.
   */
  downloader(
    service: string,
    url: string,
    status: string,
    extra?: string,
  ): void {
    const icons = {
      START: '↓',
      SUCCESS: '✔',
      FAILED: '✖',
      RETRY: '↻',
    } as const;

    const colors = {
      START: COLORS.cyan,
      SUCCESS: COLORS.green,
      FAILED: COLORS.red,
      RETRY: COLORS.yellow,
    } as const;

    const normalized =
      status.toUpperCase() as keyof typeof icons;

    const icon =
      icons[normalized] ?? '↓';

    const statusColor =
      colors[normalized] ?? COLORS.cyan;

    const shortUrl =
      this.shortenUrl(url);

    const extraInfo = extra
      ? ` ${color(`· ${extra}`, COLORS.gray)}`
      : '';

    this.logger.info(
      `${color(icon, statusColor)} ` +
        `${color(
          `[${service.toUpperCase()}]`,
          COLORS.cyan,
        )} ` +
        `${color(
          normalized,
          statusColor,
        )} ` +
        `${shortUrl}${extraInfo}`,
    );
  }

  private formatSender(
    sender: string,
  ): string {
    if (!sender) {
      return 'Unknown';
    }

    const clean = sender
      .replace(/@.*$/, '')
      .replace(/[^0-9]/g, '');

    if (clean.length >= 10) {
      const first4 = clean.slice(0, 4);
      const last4 = clean.slice(-4);

      return `+${first4}...${last4}`;
    }

    return clean || 'Unknown';
  }

  private shortenUrl(
    url: string,
    maxLength = 60,
  ): string {
    if (url.length <= maxLength) {
      return url;
    }

    return (
      url.substring(0, maxLength - 3) +
      '...'
    );
  }
}

export default new PrettyLogger();