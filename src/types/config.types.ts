// src/types/config.ts
/**
 * Type definitions untuk configuration.
 * File ini menyediakan type safety untuk seluruh konfigurasi aplikasi.
 */

/**
 * Log levels yang didukung.
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Environment types.
 */
export type Environment = 'development' | 'production' | 'test';

/**
 * Bot-specific configuration.
 */
export interface BotConfig {
  readonly bot: BotSettings;
  readonly api: ApiConfig;
  readonly downloader: DownloaderConfig;
  readonly media: MediaConfig;
  readonly logging: LoggingConfig;
  readonly session: SessionConfig;
  readonly retry: RetryConfig;
}

/**
 * Bot behavior settings.
 */
export interface BotSettings {
  readonly name: string;
  readonly prefix: string;
  readonly ownerNumber: string;
  readonly autoRead: boolean;
  readonly autoTyping: boolean;
  readonly autoRecording: boolean;
  readonly environment: Environment;
}

/**
 * API endpoints configuration.
 */
export interface ApiConfig {
  readonly jikan: JikanConfig;
  readonly traceMoe: TraceMoeConfig;
}

/**
 * Jikan API (MyAnimeList) configuration.
 */
export interface JikanConfig {
  readonly baseUrl: string;
  readonly rateLimit: number;
  readonly timeout: number;
}

/**
 * Trace.moe API configuration.
 */
export interface TraceMoeConfig {
  readonly url: string;
  readonly timeout: number;
}

/**
 * Downloader services configuration.
 */
export interface DownloaderConfig {
  readonly youtube: YouTubeConfig;
  readonly tiktok: TikTokConfig;
  readonly instagram: InstagramConfig;
  readonly facebook: FacebookConfig;
  readonly general: GeneralDownloadConfig;
}

/**
 * YouTube downloader configuration.
 */
export interface YouTubeConfig {
  readonly timeout: number;
  readonly maxSizeMb: number;
  readonly quality: 'highest' | 'lowest' | 'audio';
}

/**
 * TikTok downloader configuration.
 */
export interface TikTokConfig {
  readonly timeout: number;
  readonly withWatermark: boolean;
}

/**
 * Instagram downloader configuration.
 */
export interface InstagramConfig {
  readonly timeout: number;
  readonly includeCaption: boolean;
}

/**
 * Facebook downloader configuration.
 */
export interface FacebookConfig {
  readonly timeout: number;
  readonly quality: 'hd' | 'sd';
}

/**
 * General downloader configuration.
 */
export interface GeneralDownloadConfig {
  readonly timeout: number;
  readonly maxSizeMb: number;
}

/**
 * Media processing configuration.
 */
export interface MediaConfig {
  readonly tempDir: string;
  readonly cleanupInterval: number;
  readonly maxFileSizeMb: number;
  readonly supportedFormats: readonly string[];
}

/**
 * Logging configuration.
 */
export interface LoggingConfig {
  readonly level: LogLevel;
  readonly pretty: boolean;
  readonly combinedFile: string;
  readonly errorFile: string;
  readonly redactSensitiveData: boolean;
}

/**
 * Session management configuration.
 */
export interface SessionConfig {
  readonly dir: string;
  readonly saveInterval: number;
}

/**
 * Retry mechanism configuration.
 */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly backoffFactor: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Readonly<BotConfig> = {
  bot: {
    name: 'MapleBot',
    prefix: '.',
    ownerNumber: '',
    autoRead: true,
    autoTyping: false,
    autoRecording: false,
    environment: 'development',
  },
  api: {
    jikan: {
      baseUrl: 'https://api.jikan.moe/v4',
      rateLimit: 3,
      timeout: 10000,
    },
    traceMoe: {
      url: 'https://api.trace.moe/search',
      timeout: 15000,
    },
  },
  downloader: {
    youtube: {
      timeout: 30000,
      maxSizeMb: 50,
      quality: 'highest',
    },
    tiktok: {
      timeout: 20000,
      withWatermark: true,
    },
    instagram: {
      timeout: 20000,
      includeCaption: true,
    },
    facebook: {
      timeout: 20000,
      quality: 'hd',
    },
    general: {
      timeout: 30000,
      maxSizeMb: 50,
    },
  },
  media: {
    tempDir: 'temp',
    cleanupInterval: 3600000,
    maxFileSizeMb: 50,
    supportedFormats: ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg'],
  },
  logging: {
    level: 'info',
    pretty: true,
    combinedFile: 'logs/combined.log',
    errorFile: 'logs/error.log',
    redactSensitiveData: true,
  },
  session: {
    dir: 'sessions',
    saveInterval: 60000,
  },
  retry: {
    maxAttempts: 3,
    delayMs: 1000,
    backoffFactor: 2,
  },
} as const;