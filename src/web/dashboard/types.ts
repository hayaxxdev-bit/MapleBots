export interface DashboardConfig {
  application: {
    botName: string;
    environment: 'development' | 'production';
    prefix: string;
    mode: string;
    language: string;
    timezone: string;
  };

  access: {
    ownerConfigured: boolean;
    adminCount: number;
    dashboardEnabled: boolean;
    dashboardAuthEnabled: boolean;
  };

  whatsapp: {
    connected: boolean;
    autoRead: boolean;
    autoTyping: boolean;
    autoRecording: boolean;
    sessionDirectory: string;
    sessionEncryption: boolean;
  };

  scrapers: {
    anime: {
      primary: string;
      fallback: string[];
    };

    manga: {
      primary: string;
      fallback: string[];
    };

    doujin: string;
    waifu: string;
    nekos: string;

    timeout: number;
    maxConcurrent: number;

    cache: {
      enabled: boolean;
      ttl: number;
    };
  };

  externalApis: {
    jikan: {
      enabled: boolean;
      configured: boolean;
    };

    traceMoe: {
      enabled: boolean;
      configured: boolean;
    };

    apify: {
      configured: boolean;
    };

    rapidApi: {
      configured: boolean;
    };

    custom: {
      api1Configured: boolean;
      api2Configured: boolean;
      api3Configured: boolean;
    };
  };

  downloader: {
    youtube: {
      scraper: string;
      quality: string;
      audioOnly: boolean;
      timeout: number;
      maxSize: number;
    };

    tiktok: {
      scraper: string;
      timeout: number;
      withWatermark: boolean;
      musicExtract: boolean;
    };

    instagram: {
      scraper: string;
      timeout: number;
      type: string;
      cookiesConfigured: boolean;
    };

    facebook: {
      scraper: string;
      timeout: number;
      hd: boolean;
    };

    twitter: {
      scraper: string;
      timeout: number;
    };

    maxDownloadSize: number;
    concurrentDownloads: number;
  };

  database: {
    type: string;

    json: {
      path: string;
    };

    sqlite: {
      path: string;
    };

    mongodb: {
      configured: boolean;
      databaseName: string;
    };
  };

  cache: {
    enabled: boolean;
    type: string;
    redisConfigured: boolean;
  };

  media: {
    tempDirectory: string;
    tempCleanupInterval: number;
    maxFileSizeMB: number;

    image: {
      compressionEnabled: boolean;
      maxWidth: number;
      quality: number;
    };

    video: {
      compressionEnabled: boolean;
      maxDuration: number;
    };

    sticker: {
      maxSize: number;
      format: string;
    };
  };

  performance: {
    maxMemoryMB: number;
    workerThreads: number;

    queue: {
      enabled: boolean;
      maxSize: number;
      processDelay: number;
    };
  };

  security: {
    rateLimit: {
      enabled: boolean;
      max: number;
      window: number;
    };

    allowedDomains: string[];
    blockedCommands: string[];
  };

  behavior: {
    maxRetryAttempts: number;
    retryDelayMs: number;
    scraperFallbackEnabled: boolean;

    antiSpam: {
      enabled: boolean;
      maxCommandsPerMinute: number;
      cooldownPerCommand: number;
    };

    command: {
      caseSensitive: boolean;
      allowGroup: boolean;
      allowPrivateMessage: boolean;
    };
  };

  features: Record<string, boolean>;

  notifications: {
    onError: boolean;
    onCrash: boolean;
    onStart: boolean;
    onStop: boolean;
    onReconnect: boolean;
    onLogin: boolean;
    channel: string;
  };

  updateChecker: {
    enabled: boolean;
    interval: number;
  };
}
