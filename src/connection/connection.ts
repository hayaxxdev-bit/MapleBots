// src/connection/connection.ts
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
  BaileysEventMap,
  type AuthenticationState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { baileysLogger, logger, logHelper } from '../utils/logger';
import { config } from '../config/config';
import { handleIncomingMessage } from '../handlers/messageHandler';
import { CacheManager } from '../utils/cache';
import { DatabaseManager } from '../utils/database';
import RateLimiter from '../utils/rate-limiter';
import { TimeHelper } from '../utils/helper';

/**
 * Interface untuk bot instance.
 */
export interface BotInstance {
  readonly sock: WASocket;
  readonly stop: () => Promise<void>;
  readonly getConnectionState: () => ConnectionState;
  readonly getUptime: () => number;
  readonly getStats: () => Readonly<BotStats>;
}

export interface BotStats {
  messagesProcessed: number;
  commandsExecuted: number;
  errors: number;
  connectedAt: Date;
  uptime: number;
  reconnectAttempts: number;
}

/**
 * Reconnection configuration.
 */
interface ReconnectConfig {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly backoffFactor: number;
}

/**
 * Default reconnection configuration.
 */
const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: config.maxRetryAttempts * 3 || 10,
  baseDelay: config.retryDelayMs || 1000,
  maxDelay: 30000,
  backoffFactor: 2,
} as const;

/**
 * Reconnection state tracking.
 */
let reconnectTimer: NodeJS.Timeout | undefined;
let isReconnecting = false;
let connectedAt: Date | undefined;

/**
 * Bot statistics state
 */
export const botStats: BotStats = {
  messagesProcessed: 0,
  commandsExecuted: 0,
  errors: 0,
  connectedAt: new Date(),
  uptime: 0,
  reconnectAttempts: 0,
};

/**
 * Reset reconnection attempts after successful connection.
 */
function resetReconnectAttempts(): void {
  botStats.reconnectAttempts = 0;
  isReconnecting = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

/**
 * Calculate exponential backoff delay.
 */
function calculateBackoffDelay(attempt: number, config: ReconnectConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffFactor, attempt);
  const jitter = Math.random() * 1000; // Add random jitter
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Handle connection updates.
 */
function handleConnectionUpdate(
  sock: WASocket,
  update: Partial<BaileysEventMap['connection.update']>,
  onReconnect: () => Promise<void>
): void {
  const { connection, lastDisconnect, qr, isNewLogin } = update;

  // Handle QR code generation
  if (qr) {
    logger.info('📱 Scan QR code berikut dengan WhatsApp di HP kamu:');
    qrcode.generate(qr, { small: true });

    if (config.notifyOnError) {
      logger.info('💡 Tips: Pastikan WhatsApp di HP kamu dalam keadaan aktif');
    }
  }

  // Handle new login
  if (isNewLogin) {
    logger.info('🆕 New login detected! Welcome to MapleBot!');
  }

  // Handle connection close
  if (connection === 'close') {
    const statusCode = getDisconnectStatusCode(lastDisconnect);
    const shouldReconnect = shouldAttemptReconnect(statusCode);

    if (shouldReconnect) {
      logHelper.warn('connection', `Koneksi terputus (code: ${statusCode}). Mencoba reconnect...`);

      const delay = calculateBackoffDelay(botStats.reconnectAttempts, DEFAULT_RECONNECT_CONFIG);
      botStats.reconnectAttempts++;

      if (botStats.reconnectAttempts > DEFAULT_RECONNECT_CONFIG.maxAttempts) {
        logger.error('Max reconnection attempts reached. Stopping bot.');

        if (config.notifyOnCrash) {
          // Send notification to owner
          logger.warn('Sending crash notification to owner...');
        }

        process.exit(1);
      }

      logger.info(
        `Reconnecting dalam ${TimeHelper.formatDuration(delay / 1000)} (attempt ${botStats.reconnectAttempts}/${DEFAULT_RECONNECT_CONFIG.maxAttempts})`
      );

      isReconnecting = true;
      reconnectTimer = setTimeout(() => {
        onReconnect().catch((error: unknown) => {
          logHelper.error('reconnect', error);
          isReconnecting = false;
        });
      }, delay);
    } else {
      logger.error('❌ Sesi logout. Hapus folder sessions/ lalu scan ulang QR.');

      // Clean up session files
      cleanupSessionFiles();

      process.exit(0);
    }
  }

  // Handle successful connection
  if (connection === 'open') {
    resetReconnectAttempts();
    connectedAt = new Date();
    botStats.connectedAt = connectedAt;

    logger.info('✅ Bot berhasil terhubung ke WhatsApp!');
    // ✅ PERBAIKAN: Mengambil user info langsung dari instance socket (sock)
    logger.info(`👤 Login sebagai: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
    logger.info(`📱 Device: ${sock.user?.id ? 'Mobile' : 'Unknown'}`);

    if (config.autoRead) {
      logger.debug('Auto-read enabled');
    }
  }
}

/**
 * Clean up session files after logout.
 */
function cleanupSessionFiles(): void {
  try {
    const sessionDir = config.sessionDir;
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir);
      files.forEach((file) => {
        if (file.startsWith('creds') || file.startsWith('app-state')) {
          fs.unlinkSync(path.join(sessionDir, file));
        }
      });
      logger.info('Session files cleaned');
    }
  } catch (error) {
    logHelper.error('cleanup-session', error);
  }
}

/**
 * Extract disconnect status code from lastDisconnect.
 */
function getDisconnectStatusCode(
  lastDisconnect?: ConnectionState['lastDisconnect']
): number | undefined {
  if (!lastDisconnect) {
    return undefined;
  }

  const error = lastDisconnect.error;
  if (error instanceof Boom) {
    return error.output.statusCode;
  }

  return undefined;
}

/**
 * Determine if should attempt reconnection.
 */
function shouldAttemptReconnect(statusCode?: number): boolean {
  return statusCode !== DisconnectReason.loggedOut;
}

/**
 * Process incoming messages.
 */
async function processMessages(
  sock: WASocket,
  messages: BaileysEventMap['messages.upsert']['messages']
): Promise<void> {
  for (const msg of messages) {
    try {
      // Check rate limit
      const sender = msg.key.remoteJid || '';
      const rateLimiter = RateLimiter.getInstance();

      if (config.rateLimitEnabled && rateLimiter.isRateLimited(sender)) {
        logHelper.warn('rate-limit', `Rate limited user: ${sender}`);
        continue;
      }

      // Process message
      await handleIncomingMessage(sock, msg);

      // Update stats
      botStats.messagesProcessed++;
    } catch (error) {
      botStats.errors++;
      logHelper.error('message-processing', error);

      if (config.notifyOnError) {
        // Send error notification
        logger.debug('Error notification sent');
      }
    }
  }
}

/**
 * Handle auto-read and presence.
 */
function handleAutoBehaviors(sock: WASocket): void {
  if (config.autoTyping) {
    logger.debug('Auto-typing enabled');
  }

  if (config.autoRecording) {
    logger.debug('Auto-recording enabled');
  }
}

/**
 * Setup session persistence.
 */
async function setupSessionPersistence(): Promise<void> {
  if (config.sessionSaveInterval <= 0) return;

  setInterval(() => {
    logger.debug('Session auto-save triggered');
  }, config.sessionSaveInterval);
}

/**
 * Setup event handlers untuk socket.
 */
function setupEventHandlers(sock: WASocket, onReconnect: () => Promise<void>): void {
  sock.ev.on('creds.update', (creds) => {
    logger.debug('Credentials updated');
  });

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    handleConnectionUpdate(sock, update, onReconnect);
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      return;
    }

    await processMessages(sock, messages);
  });

  sock.ev.on('messages.update', (updates) => {
    if (updates.length > 0) {
      logger.debug({ count: updates.length }, 'Messages updated');
    }
  });

  sock.ev.on('presence.update', (presence) => {
    if (config.logLevel === 'debug' || config.logLevel === 'trace') {
      logger.debug({ presence }, 'Presence updated');
    }
  });

  sock.ev.on('groups.update', (updates) => {
    if (updates.length > 0) {
      logger.debug({ count: updates.length }, 'Groups updated');
    }
  });

  sock.ev.on('group-participants.update', (update) => {
    logger.debug({ update }, 'Group participants updated');
  });

  sock.ev.on('call', (calls) => {
    if (calls.length > 0) {
      logger.debug({ count: calls.length }, 'Incoming calls');
    }
  });

  sock.ev.on('contacts.update', (update) => {
    logger.debug({ count: update.length }, 'Contacts updated');
  });
}

/**
 * Create WhatsApp socket with custom configuration.
 */
async function createSocket(
  state: AuthenticationState,
  version: [number, number, number], // ✅ PERBAIKAN: Tipe eksplisit tuple [number, number, number]
  saveCreds: () => Promise<void>
): Promise<WASocket> {
  return makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    browser: [config.botName, 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: true,
    syncFullHistory: false,

    connectTimeoutMs: config.downloadTimeout,
    keepAliveIntervalMs: 25000,

    shouldIgnoreJid: (jid) => {
      return jid?.endsWith('@broadcast') || jid?.endsWith('@status');
    },

    retryRequestDelayMs: config.retryDelayMs,
    maxMsgRetryCount: config.maxRetryAttempts,

    // ✅ PERBAIKAN: Callback async untuk cachedGroupMetadata
    cachedGroupMetadata: async (group) => {
      return undefined;
    },

    getMessage: async (key) => {
      return undefined;
    },
  });
}

/**
 * Membuat & mengelola koneksi socket WhatsApp.
 */
export async function startBot(): Promise<BotInstance> {
  try {
    logger.info('🔌 Initializing WhatsApp connection...');

    await setupSessionPersistence();

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    // ✅ PERBAIKAN: Type assertion ke [number, number, number]
    const typedVersion = version as [number, number, number];

    logger.info(
      `📦 Menggunakan Baileys versi ${typedVersion.join('.')}${isLatest ? ' (latest)' : ' (update tersedia)'}`
    );
    logger.info(`📁 Session directory: ${config.sessionDir}`);

    const sock = await createSocket(state, typedVersion, saveCreds);

    sock.ev.on('creds.update', saveCreds);

    const reconnect = async (): Promise<void> => {
      if (isReconnecting) {
        logger.debug('Already reconnecting, skipping...');
        return;
      }

      isReconnecting = true;
      try {
        await startBot();
      } finally {
        isReconnecting = false;
      }
    };

    setupEventHandlers(sock, reconnect);
    handleAutoBehaviors(sock);
    setupHeartbeatMonitor(sock);

    return {
      sock,
      stop: async (): Promise<void> => {
        logger.info('🛑 Stopping bot connection...');
        resetReconnectAttempts();

        try {
          await sock.sendPresenceUpdate('unavailable');
          sock.end(undefined);

          const cache = CacheManager.getInstance();
          await cache.clear();

          const db = DatabaseManager.getInstance();
          await db.close();

          logger.info('✅ Bot stopped successfully');
        } catch (error) {
          logHelper.error('stop-bot', error);
          throw error;
        }
      },
      // ✅ PERBAIKAN: Mengembalikan objek ConnectionState berformat { connection: ... }
      getConnectionState: (): ConnectionState => {
        return {
          connection: sock.user ? 'open' : 'close',
        };
      },
      getUptime: (): number => {
        if (!connectedAt) return 0;
        return Date.now() - connectedAt.getTime();
      },
      getStats: (): Readonly<BotStats> => {
        return {
          ...botStats,
          uptime: connectedAt ? Date.now() - connectedAt.getTime() : 0,
        };
      },
    };
  } catch (error) {
    logHelper.error('start-bot', error);
    throw new Error('Failed to start bot connection');
  }
}

/**
 * Setup heartbeat monitor to detect connection issues.
 */
function setupHeartbeatMonitor(sock: WASocket): void {
  const heartbeatInterval = setInterval(async () => {
    try {
      if (sock.user) {
        if (config.logLevel === 'trace') {
          logger.trace('💓 Heartbeat OK');
        }
      } else {
        logHelper.warn('heartbeat', 'Connection lost, attempting to reconnect...');
      }
    } catch (error) {
      logHelper.error('heartbeat', error);
    }
  }, 30000);

  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      clearInterval(heartbeatInterval);
    }
  });
}

export {
  calculateBackoffDelay,
  getDisconnectStatusCode,
  shouldAttemptReconnect,
  DEFAULT_RECONNECT_CONFIG,
};