// src/config/config.ts
import 'dotenv/config';
import { z } from 'zod';
import path from 'path';

/**
 * Environment variable schema with comprehensive validation
 */
const envSchema = z.object({
  // Bot Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_PREFIX: z.string().min(1).max(5).default('.'),
  BOT_PREFIX_ALT: z.string().optional().default(''),
  BOT_NAME: z.string().min(1).max(50).default('MapleBot'),
  OWNER_NUMBER: z.string().optional().default(''),
  ADMIN_NUMBERS: z.string().optional().default(''),
  BOT_MODE: z.enum(['public', 'private', 'group_only']).default('public'),
  ALLOWED_GROUPS: z.string().optional().default(''),

  WEB_DASHBOARD_ENABLED: z.coerce.boolean().default(true),
  WEB_DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  WEB_DASHBOARD_AUTH: z.coerce.boolean().default(false),
  WEB_DASHBOARD_USERNAME: z.string().optional().default('admin'),
  WEB_DASHBOARD_PASSWORD: z.string().optional().default('admin123'),

  // Scraper Configuration
  ANIME_SCRAPER: z.string().default('otakudesu'),
  MANGA_SCRAPER: z.string().default('komiku'),
  DOUJIN_SCRAPER: z.string().default('nhentai'),
  WAIFU_IM: z.string().default('waifu_im'),
  NEKOS_API: z.string().default('nekos_best'),
  ANIME_SCRAPER_FALLBACK: z.string().default('samehadaku,anoboy,kuramanime'),
  MANGA_SCRAPER_FALLBACK: z.string().default('mangaku,mangadex'),

  // Scraper URLs
  OTAKUDESU_URL: z.string().url().default('https://otakudesu.blog/'),
  WAIFU_IM_URL: z.string().url().default('https://api.waifu.im/'),
  SAMEHADAKU_URL: z.string().url().default('https://v2.samehadaku.how/'),
  ANOBOY_URL: z.string().url().default('https://anoboy.xyz/'),
  KURAMANIME_URL: z.string().url().default('https://v19.kuramanime.ing/'),
  NEKOS_API_URL: z.string().url().default('https://nekos.best/api/'),
  KOMIKU_URL: z.string().url().default('https://komiku.org/'),
  MANGADEK_URL: z.string().url().default('https://mangadex.org/'),

  // Scraper Settings
  SCRAPER_TIMEOUT: z.coerce.number().int().positive().default(15000),
  SCRAPER_MAX_CONCURRENT: z.coerce.number().int().positive().default(3),
  SCRAPER_CACHE_ENABLED: z.coerce.boolean().default(true),
  SCRAPER_CACHE_TTL: z.coerce.number().int().positive().default(3600),
  SCRAPER_FALLBACK_ENABLED: z.coerce.boolean().default(true),
  SCRAPER_HEALTH_CHECK: z.coerce.boolean().default(true),
  SCRAPER_CHECK_INTERVAL: z.coerce.number().int().positive().default(300000),
  SCRAPER_AUTO_SWITCH: z.coerce.boolean().default(true),

  // API Configuration
  USE_JIKAN_API: z.coerce.boolean().default(false),
  USE_TRACE_MOE: z.coerce.boolean().default(false),
  JIKAN_BASE_URL: z.string().url().default('https://api.jikan.moe/v4'),
  JIKAN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  JIKAN_TIMEOUT: z.coerce.number().int().positive().default(10000),
  TRACE_MOE_URL: z.string().url().default('https://api.trace.moe/search'),
  TRACE_MOE_TIMEOUT: z.coerce.number().int().positive().default(15000),

  // Custom API
  CUSTOM_API_1: z.string().optional().default(''),
  CUSTOM_API_2: z.string().optional().default(''),
  CUSTOM_API_3: z.string().optional().default(''),
  WAIFU_IM_API_KEY: z.string().optional().default(''),
  TRACE_MOE_API_KEY: z.string().optional().default(''),
  CUSTOM_API_KEY: z.string().optional().default(''),

  // ScrapeOps & Pinterest Custom Scraper Settings
  SCRAPEOPS_API_KEY: z.string().optional().default(''),
  PINTEREST_SCRAPER_PATH: z.string().optional().default(''),

  // Downloader Configuration
  YOUTUBE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  YOUTUBE_MAX_SIZE: z.coerce.number().int().positive().default(100),
  YOUTUBE_SCRAPER: z.string().default('yt-dlp'),
  YOUTUBE_QUALITY: z.string().default('720p'),
  YOUTUBE_AUDIO_ONLY: z.coerce.boolean().default(false),
  TIKTOK_TIMEOUT: z.coerce.number().int().positive().default(20000),
  TIKTOK_SCRAPER: z.string().default('tikwm'),
  TIKTOK_WITH_WATERMARK: z.coerce.boolean().default(false),
  TIKTOK_MUSIC_EXTRACT: z.coerce.boolean().default(true),
  INSTAGRAM_TIMEOUT: z.coerce.number().int().positive().default(20000),
  INSTAGRAM_SCRAPER: z.string().default('snapinsta'),
  INSTAGRAM_TYPE: z.string().default('all'),
  INSTAGRAM_COOKIES_PATH: z.string().optional().default(''),
  FACEBOOK_TIMEOUT: z.coerce.number().int().positive().default(20000),
  FACEBOOK_SCRAPER: z.string().default('fdown'),
  FACEBOOK_HD: z.coerce.boolean().default(true),
  TWITTER_TIMEOUT: z.coerce.number().int().positive().default(20000),
  TWITTER_SCRAPER: z.string().default('twdown'),
  TWITTER_URL: z.string().url().default('https://twdown.net/api'),
  YTDLP_PATH: z.string().default('./bin/yt-dlp'),
  YTDLP_FORMAT: z.string().default('best[height<=720]'),
  TIKWM_URL: z.string().url().default('https://www.tikwm.com/api/'),
  SNAPINSTA_URL: z.string().url().default('https://snapinsta.app/api'),
  FDOWN_URL: z.string().url().default('https://fdown.net/api'),
  MAX_DOWNLOAD_SIZE: z.coerce.number().int().positive().default(100),
  CONCURRENT_DOWNLOADS: z.coerce.number().int().positive().default(2),
  DOWNLOAD_TIMEOUT: z.coerce.number().int().positive().max(120000).default(30000),

  // Bot Behavior
  AUTO_READ: z.coerce.boolean().default(true),
  AUTO_TYPING: z.coerce.boolean().default(true),
  AUTO_RECORDING: z.coerce.boolean().default(false),
  MAX_RETRY_ATTEMPTS: z.coerce.number().int().nonnegative().default(3),
  RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(1000),
  ANTI_SPAM_ENABLED: z.coerce.boolean().default(true),
  MAX_COMMANDS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  COOLDOWN_PER_COMMAND: z.coerce.number().int().nonnegative().default(3000),
  COMMAND_CASE_SENSITIVE: z.coerce.boolean().default(false),
  ALLOW_COMMAND_IN_GROUP: z.coerce.boolean().default(true),
  ALLOW_COMMAND_IN_PM: z.coerce.boolean().default(true),

  // Media Processing
  TEMP_DIR: z.string().default('./temp'),
  TEMP_CLEANUP_INTERVAL: z.coerce.number().int().nonnegative().default(30),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(50),
  IMAGE_COMPRESSION_ENABLED: z.coerce.boolean().default(true),
  IMAGE_MAX_WIDTH: z.coerce.number().int().positive().default(1280),
  IMAGE_QUALITY: z.coerce.number().int().min(1).max(100).default(80),
  VIDEO_COMPRESSION_ENABLED: z.coerce.boolean().default(false),
  VIDEO_MAX_DURATION: z.coerce.number().int().positive().default(300),
  STICKER_MAX_SIZE: z.coerce.number().int().positive().default(512),
  STICKER_FORMAT: z.string().default('webp'),

  // Database Configuration
  DATABASE_TYPE: z.enum(['json', 'sqlite', 'mongodb']).default('json'),
  SQLITE_PATH: z.string().default('./data/maplebot.db'),
  MONGODB_URI: z.string().optional().default(''),
  MONGODB_DB_NAME: z.string().default('maplebot'),
  JSON_DB_PATH: z.string().default('./data/database.json'),
  CACHE_ENABLED: z.coerce.boolean().default(true),
  CACHE_TYPE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(true),
  LOG_FILE_COMBINED: z.string().default('./logs/combined.log'),
  LOG_FILE_ERROR: z.string().default('./logs/error.log'),
  LOG_ROTATION_ENABLED: z.coerce.boolean().default(true),
  LOG_MAX_SIZE: z.string().default('10MB'),
  LOG_MAX_FILES: z.coerce.number().int().positive().default(5),
  BAILEYS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),

  // Session Configuration
  SESSION_DIR: z.string().default('./data/sessions'),
  SESSION_SAVE_INTERVAL: z.coerce.number().int().positive().default(10000),
  SESSION_ENCRYPTION: z.coerce.boolean().default(true),
  SESSION_PASSWORD: z.string().optional().default(''),

  // Feature Flags
  FEATURE_ANIME: z.coerce.boolean().default(true),
  FEATURE_MANGA: z.coerce.boolean().default(true),
  FEATURE_DOWNLOADER: z.coerce.boolean().default(true),
  FEATURE_WAIFU: z.coerce.boolean().default(true),
  FEATURE_NEKOS: z.coerce.boolean().default(true),
  FEATURE_STICKER: z.coerce.boolean().default(true),
  FEATURE_TRANSLATE: z.coerce.boolean().default(true),
  FEATURE_WEATHER: z.coerce.boolean().default(true),
  FEATURE_NEWS: z.coerce.boolean().default(true),
  FEATURE_GAME: z.coerce.boolean().default(true),
  FEATURE_MUSIC: z.coerce.boolean().default(true),

  // Localization
  DEFAULT_LANGUAGE: z.string().default('id'),
  TIMEZONE: z.string().default('Asia/Jakarta'),
  DATE_FORMAT: z.string().default('DD/MM/YYYY'),
  TIME_FORMAT: z.string().default('HH:mm:ss'),

  // Performance
  MAX_MEMORY_USAGE: z.coerce.number().int().positive().default(512),
  WORKER_THREADS: z.coerce.number().int().positive().default(2),
  QUEUE_ENABLED: z.coerce.boolean().default(true),
  MAX_QUEUE_SIZE: z.coerce.number().int().positive().default(100),
  QUEUE_PROCESS_DELAY: z.coerce.number().int().nonnegative().default(500),

  // Security
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  ALLOWED_DOMAINS: z
    .string()
    .default('youtube.com,youtu.be,tiktok.com,instagram.com,facebook.com,twitter.com'),
  BLOCKED_COMMANDS: z.string().optional().default(''),

  // Notification
  NOTIFY_ON_ERROR: z.coerce.boolean().default(true),
  NOTIFY_ON_CRASH: z.coerce.boolean().default(true),
  NOTIFY_ON_STOP: z.coerce.boolean().default(true),
  NOTIFY_CHANNEL: z.string().default('owner'),
  CHECK_UPDATES: z.coerce.boolean().default(true),
  UPDATE_INTERVAL: z.coerce.number().int().positive().default(86400),

  // Legacy
  MAX_FILE_SIZE: z.coerce.number().int().positive().max(100).default(50),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.issues);
  throw new Error('Environment validation failed. Check your .env file.');
}

const env = parsedEnv.data;

/**
 * Comprehensive bot configuration interface
 */
export interface BotConfig {
  // Bot
  readonly prefix: string;
  readonly prefixAlt: string[];
  readonly botName: string;
  readonly ownerNumber: string;
  readonly adminNumbers: string[];
  readonly botMode: 'public' | 'private' | 'group_only';
  readonly allowedGroups: string[];

  // Web Dashboard
  readonly webDashboardEnabled: boolean;
  readonly webDashboardPort: number;
  readonly webDashboardAuth: boolean;
  readonly webDashboardUsername?: string;
  readonly webDashboardPassword?: string;

  // Scrapers
  readonly animeScraper: string;
  readonly mangaScraper: string;
  readonly doujinScraper: string;
  readonly waifuIm: string;
  readonly nekosApi: string;
  readonly animeScraperFallback: string[];
  readonly mangaScraperFallback: string[];
  readonly scraperUrls: string[];
  readonly scraperTimeout: number;
  readonly scraperMaxConcurrent: number;
  readonly scraperCacheEnabled: boolean;
  readonly scraperCacheTtl: number;
  readonly scraperFallbackEnabled: boolean;
  readonly scraperHealthCheck: boolean;
  readonly scraperCheckInterval: number;
  readonly scraperAutoSwitch: boolean;

  // APIs
  readonly useJikanApi: boolean;
  readonly useTraceMoe: boolean;
  readonly jikanBaseUrl: string;
  readonly jikanRateLimit: number;
  readonly jikanTimeout: number;
  readonly traceMoeUrl: string;
  readonly traceMoeTimeout: number;
  readonly customApis: string[];
  readonly apiKeys: Record<string, string>;

  // Downloader
  readonly downloadTimeout: number;
  readonly maxFileSizeMB: number;
  readonly maxDownloadSize: number;
  readonly concurrentDownloads: number;
  readonly youtubeConfig: Record<string, unknown>;
  readonly tiktokConfig: Record<string, unknown>;
  readonly instagramConfig: Record<string, unknown>;
  readonly facebookConfig: Record<string, unknown>;
  readonly twitterConfig: Record<string, unknown>;

  // Behavior
  readonly autoRead: boolean;
  readonly autoTyping: boolean;
  readonly autoRecording: boolean;
  readonly maxRetryAttempts: number;
  readonly retryDelayMs: number;
  readonly antiSpamEnabled: boolean;
  readonly maxCommandsPerMinute: number;
  readonly cooldownPerCommand: number;

  // Media
  readonly tempDir: string;
  readonly tempCleanupInterval: number;
  readonly imageCompressionEnabled: boolean;
  readonly imageMaxWidth: number;
  readonly imageQuality: number;
  readonly stickerMaxSize: number;
  readonly stickerFormat: string;

  // Database
  readonly databaseType: 'json' | 'sqlite' | 'mongodb';
  readonly databasePath: string;
  readonly cacheEnabled: boolean;
  readonly cacheType: 'memory' | 'redis';
  readonly redisUrl: string;

  // Logging
  readonly logLevel: string;
  readonly logPretty: boolean;
  readonly logFileCombined: string;
  readonly logFileError: string;
  readonly baileysLogLevel: string;

  // Session
  readonly sessionDir: string;
  readonly sessionSaveInterval: number;
  readonly sessionEncryption: boolean;
  readonly sessionPassword: string;

  // Features
  readonly features: Record<string, boolean>;

  // Localization
  readonly defaultLanguage: string;
  readonly timezone: string;
  readonly dateFormat: string;
  readonly timeFormat: string;

  // Performance
  readonly maxMemoryUsage: number;
  readonly workerThreads: number;
  readonly queueEnabled: boolean;
  readonly maxQueueSize: number;
  readonly queueProcessDelay: number;

  // Security
  readonly rateLimitEnabled: boolean;
  readonly rateLimitMax: number;
  readonly rateLimitWindow: number;
  readonly allowedDomains: string[];
  readonly blockedCommands: string[];

  // Notification
  readonly notifyOnError: boolean;
  readonly notifyOnStop: boolean;
  readonly notifyOnCrash: boolean;
  readonly notifyChannel: string;

  // Environment
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly scrapeopsApiKey: string;
  readonly pinterestScraperPath: string;
}

/**
 * Parse comma-separated string to array
 */
function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Build configuration object
 */
export const config: BotConfig = {
  // Bot
  prefix: env.BOT_PREFIX,
  prefixAlt: parseList(env.BOT_PREFIX_ALT || ''),
  botName: env.BOT_NAME,
  ownerNumber: env.OWNER_NUMBER,
  adminNumbers: parseList(env.ADMIN_NUMBERS || ''),
  botMode: env.BOT_MODE,
  allowedGroups: parseList(env.ALLOWED_GROUPS || ''),

  // ScrapeOps API & Pinterest Custom Scraper Path
  scrapeopsApiKey: env.SCRAPEOPS_API_KEY,
  pinterestScraperPath: env.PINTEREST_SCRAPER_PATH,

  // Scrapers
  animeScraper: env.ANIME_SCRAPER,
  mangaScraper: env.MANGA_SCRAPER,
  doujinScraper: env.DOUJIN_SCRAPER,
  waifuIm: env.WAIFU_IM ?? 'https://api.waifu.im',
  nekosApi: env.NEKOS_API,
  animeScraperFallback: parseList(env.ANIME_SCRAPER_FALLBACK),
  mangaScraperFallback: parseList(env.MANGA_SCRAPER_FALLBACK),
  scraperUrls: [
    env.OTAKUDESU_URL,
    env.WAIFU_IM_URL,
    env.SAMEHADAKU_URL,
    env.ANOBOY_URL,
    env.KURAMANIME_URL,
    env.NEKOS_API_URL,
    env.KOMIKU_URL,
    env.MANGADEK_URL,
  ].filter(Boolean),
  scraperTimeout: env.SCRAPER_TIMEOUT,
  scraperMaxConcurrent: env.SCRAPER_MAX_CONCURRENT,
  scraperCacheEnabled: env.SCRAPER_CACHE_ENABLED,
  scraperCacheTtl: env.SCRAPER_CACHE_TTL,
  scraperFallbackEnabled: env.SCRAPER_FALLBACK_ENABLED,
  scraperHealthCheck: env.SCRAPER_HEALTH_CHECK,
  scraperCheckInterval: env.SCRAPER_CHECK_INTERVAL,
  scraperAutoSwitch: env.SCRAPER_AUTO_SWITCH,

  webDashboardEnabled: env.WEB_DASHBOARD_ENABLED,
  webDashboardPort: env.WEB_DASHBOARD_PORT,
  webDashboardAuth: env.WEB_DASHBOARD_AUTH,
  webDashboardUsername: env.WEB_DASHBOARD_USERNAME,
  webDashboardPassword: env.WEB_DASHBOARD_PASSWORD,

  // APIs
  useJikanApi: env.USE_JIKAN_API,
  useTraceMoe: env.USE_TRACE_MOE,
  jikanBaseUrl: env.JIKAN_BASE_URL,
  jikanRateLimit: env.JIKAN_RATE_LIMIT,
  jikanTimeout: env.JIKAN_TIMEOUT,
  traceMoeUrl: env.TRACE_MOE_URL,
  traceMoeTimeout: env.TRACE_MOE_TIMEOUT,
  customApis: [env.CUSTOM_API_1, env.CUSTOM_API_2, env.CUSTOM_API_3].filter(Boolean),
  apiKeys: {
    waifuIm: env.WAIFU_IM_API_KEY,
    traceMoe: env.TRACE_MOE_API_KEY,
    custom: env.CUSTOM_API_KEY,
  },

  // Downloader
  downloadTimeout: env.DOWNLOAD_TIMEOUT,
  maxFileSizeMB: env.MAX_FILE_SIZE_MB,
  maxDownloadSize: env.MAX_DOWNLOAD_SIZE,
  concurrentDownloads: env.CONCURRENT_DOWNLOADS,
  youtubeConfig: {
    timeout: env.YOUTUBE_TIMEOUT,
    maxSize: env.YOUTUBE_MAX_SIZE,
    scraper: env.YOUTUBE_SCRAPER,
    quality: env.YOUTUBE_QUALITY,
    audioOnly: env.YOUTUBE_AUDIO_ONLY,
    ytdlpPath: env.YTDLP_PATH,
    ytdlpFormat: env.YTDLP_FORMAT,
  },
  tiktokConfig: {
    timeout: env.TIKTOK_TIMEOUT,
    scraper: env.TIKTOK_SCRAPER,
    withWatermark: env.TIKTOK_WITH_WATERMARK,
    musicExtract: env.TIKTOK_MUSIC_EXTRACT,
    apiUrl: env.TIKWM_URL,
  },
  instagramConfig: {
    timeout: env.INSTAGRAM_TIMEOUT,
    scraper: env.INSTAGRAM_SCRAPER,
    type: env.INSTAGRAM_TYPE,
    apiUrl: env.SNAPINSTA_URL,
    cookiesPath: env.INSTAGRAM_COOKIES_PATH,
  },
  facebookConfig: {
    timeout: env.FACEBOOK_TIMEOUT,
    scraper: env.FACEBOOK_SCRAPER,
    hd: env.FACEBOOK_HD,
    apiUrl: env.FDOWN_URL,
  },
  twitterConfig: {
    timeout: env.TWITTER_TIMEOUT,
    scraper: env.TWITTER_SCRAPER,
    apiUrl: env.TWITTER_URL,
  },

  // Behavior
  autoRead: env.AUTO_READ,
  autoTyping: env.AUTO_TYPING,
  autoRecording: env.AUTO_RECORDING,
  maxRetryAttempts: env.MAX_RETRY_ATTEMPTS,
  retryDelayMs: env.RETRY_DELAY_MS,
  antiSpamEnabled: env.ANTI_SPAM_ENABLED,
  maxCommandsPerMinute: env.MAX_COMMANDS_PER_MINUTE,
  cooldownPerCommand: env.COOLDOWN_PER_COMMAND,

  // Media
  tempDir: path.resolve(process.cwd(), env.TEMP_DIR),
  tempCleanupInterval: env.TEMP_CLEANUP_INTERVAL,
  imageCompressionEnabled: env.IMAGE_COMPRESSION_ENABLED,
  imageMaxWidth: env.IMAGE_MAX_WIDTH,
  imageQuality: env.IMAGE_QUALITY,
  stickerMaxSize: env.STICKER_MAX_SIZE,
  stickerFormat: env.STICKER_FORMAT,

  // Database
  databaseType: env.DATABASE_TYPE,
  databasePath: env.DATABASE_TYPE === 'sqlite' ? env.SQLITE_PATH : env.JSON_DB_PATH,
  cacheEnabled: env.CACHE_ENABLED,
  cacheType: env.CACHE_TYPE,
  redisUrl: env.REDIS_URL,

  // Logging
  logLevel: env.LOG_LEVEL,
  logPretty: env.LOG_PRETTY,
  logFileCombined: env.LOG_FILE_COMBINED,
  logFileError: env.LOG_FILE_ERROR,
  baileysLogLevel: env.BAILEYS_LOG_LEVEL,

  // Session
  sessionDir: path.resolve(process.cwd(), env.SESSION_DIR),
  sessionSaveInterval: env.SESSION_SAVE_INTERVAL,
  sessionEncryption: env.SESSION_ENCRYPTION,
  sessionPassword: env.SESSION_PASSWORD,

  // Features
  features: {
    anime: env.FEATURE_ANIME,
    manga: env.FEATURE_MANGA,
    downloader: env.FEATURE_DOWNLOADER,
    waifu: env.FEATURE_WAIFU,
    nekos: env.FEATURE_NEKOS,
    sticker: env.FEATURE_STICKER,
    translate: env.FEATURE_TRANSLATE,
    weather: env.FEATURE_WEATHER,
    news: env.FEATURE_NEWS,
    game: env.FEATURE_GAME,
    music: env.FEATURE_MUSIC,
  },

  // Localization
  defaultLanguage: env.DEFAULT_LANGUAGE,
  timezone: env.TIMEZONE,
  dateFormat: env.DATE_FORMAT,
  timeFormat: env.TIME_FORMAT,

  // Performance
  maxMemoryUsage: env.MAX_MEMORY_USAGE,
  workerThreads: env.WORKER_THREADS,
  queueEnabled: env.QUEUE_ENABLED,
  maxQueueSize: env.MAX_QUEUE_SIZE,
  queueProcessDelay: env.QUEUE_PROCESS_DELAY,

  // Security
  rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  rateLimitMax: env.RATE_LIMIT_MAX,
  rateLimitWindow: env.RATE_LIMIT_WINDOW,
  allowedDomains: parseList(env.ALLOWED_DOMAINS),
  blockedCommands: parseList(env.BLOCKED_COMMANDS || ''),

  // Notification
  notifyOnError: env.NOTIFY_ON_ERROR,
  notifyOnCrash: env.NOTIFY_ON_CRASH,
  notifyOnStop: env.NOTIFY_ON_STOP,
  notifyChannel: env.NOTIFY_CHANNEL,

  // Environment
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
} as const;

Object.freeze(config);
