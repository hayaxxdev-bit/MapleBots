import { config } from '../../config/config';

export interface DashboardConfigSnapshot {
  environment: {
    nodeEnv: string;
    production: boolean;
    development: boolean;
    botName: string;
    botMode: string;
    prefix: string;
    timezone: string;
  };
  dashboard: {
    enabled: boolean;
    port: number;
    authEnabled: boolean;
  };
  bot: {
    owner: string;
    admins: string[];
    autoRead: boolean;
    autoTyping: boolean;
    autoRecording: boolean;
    commandCaseSensitive: boolean;
    allowGroup: boolean;
    allowPrivate: boolean;
  };
  scrapers: {
    primary: Record<string, string>;
    fallback: Record<string, string[]>;
    endpoints: string[];
    settings: {
      timeoutMs: number;
      maxConcurrent: number;
      cacheEnabled: boolean;
      cacheTtlSeconds: number;
      fallbackEnabled: boolean;
      healthCheckEnabled: boolean;
      autoSwitch: boolean;
    };
  };
  apis: {
    jikan: ApiStatus;
    traceMoe: ApiStatus;
    custom: ApiStatus[];
    keys: Record<string, boolean>;
  };
  downloaders: Record<string, Record<string, unknown>>;
  media: Record<string, unknown>;
  database: {
    type: string;
    path: string;
    cacheEnabled: boolean;
    cacheType: string;
    redisConfigured: boolean;
  };
  logging: {
    level: string;
    pretty: boolean;
    baileysLevel: string;
    combinedFile: string;
    errorFile: string;
    rotationEnabled: boolean;
  };
  session: {
    directory: string;
    saveIntervalMs: number;
    encryptionEnabled: boolean;
    passwordConfigured: boolean;
  };
  features: Record<string, boolean>;
  localization: {
    language: string;
    timezone: string;
    dateFormat: string;
    timeFormat: string;
  };
  performance: {
    maxMemoryMb: number;
    workerThreads: number;
    queueEnabled: boolean;
    maxQueueSize: number;
    queueProcessDelayMs: number;
  };
  security: {
    rateLimitEnabled: boolean;
    rateLimitMax: number;
    rateLimitWindowMs: number;
    allowedDomains: string[];
    blockedCommands: string[];
  };
  notifications: {
    onError: boolean;
    onCrash: boolean;
    channel: string;
    onStart: boolean;
    onStop: boolean;
    onReconnect: boolean;
    onLogin: boolean;
    updateCheckEnabled: boolean;
    updateIntervalSeconds: number;
  };
}

interface ApiStatus {
  enabled: boolean;
  configured: boolean;
  endpoint: string;
  timeoutMs: number;
  rateLimit?: number;
}

function maskNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return 'not configured';
  }
  if (digits.length <= 6) {
    return `••••${digits}`;
  }
  return `${digits.slice(0, 3)}••••${digits.slice(-3)}`;
}

function safeEndpoint(value: string): string {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? '';
  }
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function configuredKeys(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(config.apiKeys ?? {}).map(([name, value]) => [name, configured(value)])
  );
}

export function getPublicConfigSnapshot(): DashboardConfigSnapshot {
  const env = process.env;

  return {
    environment: {
      nodeEnv: env['NODE_ENV'] ?? (config.isProduction ? 'production' : 'development'),
      production: config.isProduction,
      development: config.isDevelopment,
      botName: config.botName,
      botMode: config.botMode,
      prefix: config.prefix,
      timezone: config.timezone,
    },

    dashboard: {
      enabled: env['WEB_DASHBOARD_ENABLED'] !== 'false',
      port: Number(env['WEB_DASHBOARD_PORT'] ?? 3000),
      authEnabled: env['WEB_DASHBOARD_AUTH'] === 'true',
    },

    bot: {
      owner: maskNumber(config.ownerNumber),
      admins: config.adminNumbers.map(maskNumber),
      autoRead: config.autoRead,
      autoTyping: config.autoTyping,
      autoRecording: config.autoRecording,
      commandCaseSensitive: Boolean(env['COMMAND_CASE_SENSITIVE'] === 'true'),
      allowGroup: Boolean(env['ALLOW_COMMAND_IN_GROUP'] !== 'false'),
      allowPrivate: Boolean(env['ALLOW_COMMAND_IN_PM'] !== 'false'),
    },

    scrapers: {
      primary: {
        anime: config.animeScraper,
        manga: config.mangaScraper,
        doujin: config.doujinScraper,
        waifu: config.waifuIm,
        nekos: config.nekosApi,
      },
      fallback: {
        anime: config.animeScraperFallback,
        manga: config.mangaScraperFallback,
      },
      endpoints: config.scraperUrls.map(safeEndpoint),
      settings: {
        timeoutMs: config.scraperTimeout,
        maxConcurrent: config.scraperMaxConcurrent,
        cacheEnabled: config.scraperCacheEnabled,
        cacheTtlSeconds: config.scraperCacheTtl,
        fallbackEnabled: config.scraperFallbackEnabled,
        healthCheckEnabled: config.scraperHealthCheck,
        autoSwitch: config.scraperAutoSwitch,
      },
    },

    apis: {
      jikan: {
        enabled: config.useJikanApi,
        configured: true,
        endpoint: safeEndpoint(config.jikanBaseUrl),
        timeoutMs: config.jikanTimeout,
        rateLimit: config.jikanRateLimit,
      },
      traceMoe: {
        enabled: config.useTraceMoe,
        configured: true,
        endpoint: safeEndpoint(config.traceMoeUrl),
        timeoutMs: config.traceMoeTimeout,
      },
      custom: config.customApis.map(
        (endpoint, index) =>
          ({
            name: `custom_${index + 1}`,
            enabled: true,
            configured: configured(endpoint),
            endpoint: safeEndpoint(endpoint),
            timeoutMs: 0,
          }) as ApiStatus & { name: string }
      ),
      keys: configuredKeys(),
    },

    downloaders: {
      youtube: config.youtubeConfig,
      tiktok: config.tiktokConfig,
      instagram: {
        ...config.instagramConfig,
        cookiesConfigured: configured(env['INSTAGRAM_COOKIES_PATH']),
        cookiesPath: env['INSTAGRAM_COOKIES_PATH'] ?? '',
      },
      facebook: config.facebookConfig,
      twitter: config.twitterConfig,
      limits: {
        maxDownloadSizeMb: config.maxDownloadSize,
        concurrentDownloads: config.concurrentDownloads,
        timeoutMs: config.downloadTimeout,
      },
    },

    media: {
      tempDirectory: config.tempDir,
      cleanupIntervalMinutes: config.tempCleanupInterval,
      maxFileSizeMb: config.maxFileSizeMB,
      imageCompressionEnabled: config.imageCompressionEnabled,
      imageMaxWidth: config.imageMaxWidth,
      imageQuality: config.imageQuality,
      stickerMaxSize: config.stickerMaxSize,
      stickerFormat: config.stickerFormat,
    },

    database: {
      type: config.databaseType,
      path: config.databasePath,
      cacheEnabled: config.cacheEnabled,
      cacheType: config.cacheType,
      redisConfigured: configured(env['REDIS_URL']),
    },

    logging: {
      level: config.logLevel,
      pretty: config.logPretty,
      baileysLevel: config.baileysLogLevel,
      combinedFile: config.logFileCombined,
      errorFile: config.logFileError,
      rotationEnabled: Boolean(env['LOG_ROTATION_ENABLED'] !== 'false'),
    },

    session: {
      directory: config.sessionDir,
      saveIntervalMs: config.sessionSaveInterval,
      encryptionEnabled: config.sessionEncryption,
      passwordConfigured: configured(config.sessionPassword),
    },

    features: { ...config.features },

    localization: {
      language: config.defaultLanguage,
      timezone: config.timezone,
      dateFormat: config.dateFormat,
      timeFormat: config.timeFormat,
    },

    performance: {
      maxMemoryMb: config.maxMemoryUsage,
      workerThreads: config.workerThreads,
      queueEnabled: config.queueEnabled,
      maxQueueSize: config.maxQueueSize,
      queueProcessDelayMs: config.queueProcessDelay,
    },

    security: {
      rateLimitEnabled: config.rateLimitEnabled,
      rateLimitMax: config.rateLimitMax,
      rateLimitWindowMs: config.rateLimitWindow,
      allowedDomains: config.allowedDomains,
      blockedCommands: config.blockedCommands,
    },

    notifications: {
      onError: config.notifyOnError,
      onCrash: config.notifyOnCrash,
      channel: config.notifyChannel,
      onStart: env['NOTIFY_ON_START'] !== 'false',
      onStop: env['NOTIFY_ON_STOP'] !== 'false',
      onReconnect: env['NOTIFY_ON_RECONNECT'] !== 'false',
      onLogin: env['NOTIFY_ON_LOGIN'] !== 'false',
      updateCheckEnabled: env['CHECK_UPDATES'] !== 'false',
      updateIntervalSeconds: Number(env['UPDATE_INTERVAL'] ?? 86400),
    },
  };
}
