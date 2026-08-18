import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type AuthenticationState,
  type BaileysEventMap,
  type ConnectionState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

import { config } from '../../config/config';
import { logger, baileysLogger, logHelper } from '../../infrastructure/logging/logger';
import { handleIncomingMessage } from './message-handler';
import { TimeHelper } from '../../utils/helper';
import { notificationService } from '@/infrastructure/notification/notification-service';
import { setWhatsAppRuntime } from '@/web/dashboard/runtime-state';
import { getApiRegistrySnapshot } from '../../infrastructure/api/api-health';

export interface BotStats {
  messagesProcessed: number;
  commandsExecuted: number;
  errors: number;
  connectedAt: Date;
  uptime: number;
  reconnectAttempts: number;
}

export interface BotInstance {
  /**
   * Always returns the currently active socket.
   *
   * Reconnect creates a new socket, so this must not
   * permanently reference the first socket.
   */
  readonly sock: WASocket;

  readonly stop: () => Promise<void>;
  readonly getConnectionState: () => ConnectionState;
  readonly getUptime: () => number;
  readonly getStats: () => Readonly<BotStats>;
}

interface ReconnectConfig {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly backoffFactor: number;
}

const reconnectConfig: ReconnectConfig = {
  maxAttempts: Math.max(config.maxRetryAttempts * 3, 10),
  baseDelay: Math.max(config.retryDelayMs, 1_000),
  maxDelay: 30_000,
  backoffFactor: 2,
};

export const botStats: BotStats = {
  messagesProcessed: 0,
  commandsExecuted: 0,
  errors: 0,
  connectedAt: new Date(),
  uptime: 0,
  reconnectAttempts: 0,
};

let currentSocket: WASocket | undefined;

let reconnectTimer: NodeJS.Timeout | undefined;
let heartbeatCleanup: (() => void) | undefined;
let connectedAt: Date | undefined;

let stopping = false;
let reconnecting = false;

function calculateBackoffDelay(attempt: number): number {
  const exponential = reconnectConfig.baseDelay * Math.pow(reconnectConfig.backoffFactor, attempt);

  const jitter = Math.random() * 1_000;

  return Math.min(exponential + jitter, reconnectConfig.maxDelay);
}

function getDisconnectStatusCode(
  lastDisconnect?: ConnectionState['lastDisconnect']
): number | undefined {
  const error = lastDisconnect?.error;

  if (error instanceof Boom) {
    return error.output.statusCode;
  }

  return undefined;
}

function shouldAttemptReconnect(statusCode?: number): boolean {
  if (stopping) {
    return false;
  }

  /**
   * Logged out means the credentials are no longer valid.
   * Do not endlessly reconnect.
   */
  if (statusCode === DisconnectReason.loggedOut) {
    return false;
  }

  /**
   * A bad session should not result in an endless
   * reconnect loop either.
   */
  if (statusCode === DisconnectReason.badSession) {
    return false;
  }

  return true;
}

function calculateUptime(): number {
  if (!connectedAt) {
    return 0;
  }

  return Date.now() - connectedAt.getTime();
}

function createSocket(state: AuthenticationState): WASocket {
  logger.info('📱 Creating WhatsApp socket...');

  return makeWASocket({
    auth: state,

    logger: baileysLogger,

    /**
     * We render the QR ourselves using qrcode-terminal.
     */
    printQRInTerminal: false,

    browser: [config.botName, 'Chrome', '1.0.0'],

    generateHighQualityLinkPreview: true,

    markOnlineOnConnect: true,

    syncFullHistory: false,

    connectTimeoutMs: config.downloadTimeout,

    keepAliveIntervalMs: 25_000,

    retryRequestDelayMs: config.retryDelayMs,

    maxMsgRetryCount: config.maxRetryAttempts,

    shouldIgnoreJid: (jid) => Boolean(jid?.endsWith('@broadcast') || jid?.endsWith('@status')),
  });
}

function setupHeartbeat(sock: WASocket): () => void {
  const timer = setInterval(() => {
    if (!sock.user) {
      logHelper.warn('whatsapp:heartbeat', 'Connection may be unavailable.');

      return;
    }

    if (config.logLevel === 'trace') {
      logger.trace('💓 WhatsApp heartbeat OK');
    }
  }, 30_000);

  return () => {
    clearInterval(timer);
  };
}

function cleanupSocketResources(): void {
  if (heartbeatCleanup) {
    heartbeatCleanup();
    heartbeatCleanup = undefined;
  }
}

function scheduleReconnect(connect: () => Promise<void>, statusCode?: number): void {
  if (stopping) {
    return;
  }

  if (botStats.reconnectAttempts >= reconnectConfig.maxAttempts) {
    logger.error('Maximum WhatsApp reconnection attempts reached.');

    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  const delay = calculateBackoffDelay(botStats.reconnectAttempts);

  botStats.reconnectAttempts++;

  logger.warn(
    `WhatsApp disconnected (code: ${
      statusCode ?? 'unknown'
    }). Reconnecting in ${TimeHelper.formatDuration(delay / 1000)} (attempt ${
      botStats.reconnectAttempts
    }/${reconnectConfig.maxAttempts})`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;

    void connect();
  }, delay);
}

function setupEventHandlers(
  sock: WASocket,
  saveCreds: (
    update: Parameters<NonNullable<Parameters<WASocket['ev']['on']>[1]>>[0]
  ) => Promise<void>,
  connect: () => Promise<void>
): void {
  cleanupSocketResources();

  heartbeatCleanup = setupHeartbeat(sock);

  sock.ev.on('creds.update', (update) => {
    void (async () => {
      try {
        await saveCreds(update);

        if (config.logLevel === 'debug') {
          logger.debug('WhatsApp credentials updated.');
        }
      } catch (error: unknown) {
        botStats.errors++;

        logHelper.error('whatsapp:save-creds', error);
      }
    })();
  });

  sock.ev.on('connection.update', (update) => {
    void handleConnectionUpdate(sock, update, connect);
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') {
      return;
    }

    void (async () => {
      for (const message of messages) {
        try {
          await handleIncomingMessage(sock, message);

          botStats.messagesProcessed++;
        } catch (error: unknown) {
          botStats.errors++;

          logHelper.error('whatsapp:message', error);
        }
      }
    })();
  });

  sock.ev.on('messages.update', (updates) => {
    if (updates.length > 0 && config.logLevel === 'debug') {
      logger.debug(
        {
          count: updates.length,
        },
        'Messages updated'
      );
    }
  });

  sock.ev.on('presence.update', (presence) => {
    if (config.logLevel === 'trace') {
      logger.trace(
        {
          presence,
        },
        'Presence updated'
      );
    }
  });

  sock.ev.on('groups.update', (updates) => {
    if (updates.length > 0 && config.logLevel === 'debug') {
      logger.debug(
        {
          count: updates.length,
        },
        'Groups updated'
      );
    }
  });

  sock.ev.on('group-participants.update', (update) => {
    if (config.logLevel === 'debug') {
      logger.debug(
        {
          update,
        },
        'Group participants updated'
      );
    }
  });

  sock.ev.on('call', (calls) => {
    if (calls.length > 0 && config.logLevel === 'debug') {
      logger.debug(
        {
          count: calls.length,
        },
        'Incoming calls'
      );
    }
  });

  sock.ev.on('contacts.update', (update) => {
    if (config.logLevel === 'debug') {
      logger.debug(
        {
          count: update.length,
        },
        'Contacts updated'
      );
    }
  });
}

async function handleConnectionUpdate(
  sock: WASocket,
  update: Partial<BaileysEventMap['connection.update']>,
  connect: () => Promise<void>
): Promise<void> {
  const { connection, lastDisconnect, qr, isNewLogin } = update;

  /**
   * Connecting
   */
  if (connection === 'connecting') {
    setWhatsAppRuntime({
      connected: false,
      connection: 'connecting',
      connectedAt: connectedAt?.toISOString() ?? null,
      user: {
        id: sock.user?.id ?? null,
        name: sock.user?.name ?? null,
      },
      reconnectAttempts: botStats.reconnectAttempts,
      lastDisconnectCode: null,
    });
  }

  /**
   * QR
   */
  if (qr) {
    logger.info('📱 Scan QR code berikut dengan WhatsApp:');

    qrcode.generate(qr, {
      small: true,
    });
  }

  /**
   * New login
   */
  if (isNewLogin) {
    logger.info('🆕 New WhatsApp login detected.');
  }

  /**
   * Connected
   */
  if (connection === 'open') {
    currentSocket = sock;

    connectedAt = new Date();

    botStats.connectedAt = connectedAt;
    botStats.uptime = 0;
    botStats.reconnectAttempts = 0;

    reconnecting = false;

    setWhatsAppRuntime({
      connected: true,
      connection: 'open',
      connectedAt: connectedAt.toISOString(),
      user: {
        id: sock.user?.id ?? null,
        name: sock.user?.name ?? null,
      },
      reconnectAttempts: botStats.reconnectAttempts,
      lastDisconnectCode: null,
    });

    logger.info(
      {
        whatsappUser: {
          id: sock.user?.id ?? null,
          name: sock.user?.name ?? null,
        },
        connectedAt: connectedAt.toISOString(),
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        dashboardPort: config.webDashboardPort,
      },
      '✅ Bot berhasil terhubung ke WhatsApp!'
    );

    /*
     * Build API summary for the owner notification.
     *
     * Health checking is intentionally isolated here so
     * failure of an external API cannot prevent WhatsApp
     * from becoming online.
     */
    let apiSummary: {
      total: number;
      enabled: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      disabled: number;
      unknown: number;
    } = {
      total: 0,
      enabled: 0,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      disabled: 0,
      unknown: 0,
    };

    try {
      const snapshot = await getApiRegistrySnapshot();

      apiSummary = {
        total: snapshot.total,
        enabled: snapshot.enabled,
        healthy: snapshot.healthy,
        degraded: snapshot.degraded,
        unhealthy: snapshot.unhealthy,
        disabled: snapshot.disabled,
        unknown: snapshot.unknown,
      };
    } catch (error: unknown) {
      logHelper.error('whatsapp:api-summary', error);
    }

    /*
     * Version:
     *
     * npm_package_version exists when Node is started through
     * npm lifecycle scripts. In other environments it may be
     * unavailable, therefore we provide a safe fallback.
     */
    const packageVersion = process.env['npm_package_version'] ?? 'development';

    const featuresEnabled = Object.values(config.features).filter(Boolean).length;

    try {
      await notificationService.sendBotOnlineNotification(calculateUptime(), packageVersion, {
        whatsappUser: {
          id: sock.user?.id ?? '',
          name: sock.user?.name ?? undefined,
        },
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        dashboardUrl: `http://localhost:${config.webDashboardPort}`,
        apiProviders: apiSummary,
        featuresEnabled,
      });
    } catch (error: unknown) {
      logHelper.error('notification:bot-online', error);
    }

    return;
  }

  /**
   * Connection closed
   */
  if (connection !== 'close' || stopping) {
    return;
  }

  const statusCode = getDisconnectStatusCode(lastDisconnect);

  setWhatsAppRuntime({
    connected: false,
    connection: 'close',
    connectedAt: connectedAt?.toISOString() ?? null,
    user: {
      id: sock.user?.id ?? null,
      name: sock.user?.name ?? null,
    },
    reconnectAttempts: botStats.reconnectAttempts,
    lastDisconnectCode: statusCode ?? null,
  });

  cleanupSocketResources();

  if (currentSocket === sock) {
    currentSocket = undefined;
  }

  /**
   * Permanent disconnect.
   *
   * These states require manual intervention.
   */
  if (!shouldAttemptReconnect(statusCode)) {
    reconnecting = false;

    const uptime = calculateUptime();

    let reason: string;

    if (statusCode === DisconnectReason.loggedOut) {
      reason = 'loggedOut';

      logger.error('❌ WhatsApp session logged out.');
    } else if (statusCode === DisconnectReason.badSession) {
      reason = 'badSession';

      logger.error('❌ WhatsApp session is invalid.');
    } else {
      reason = statusCode !== undefined ? String(statusCode) : 'connectionStopped';

      logger.error('❌ WhatsApp connection stopped.');
    }

    if (config.notifyOnStop) {
      void notificationService
        .sendBotOfflineNotification(reason, uptime)
        .catch((error: unknown) => {
          logHelper.error('notification:bot-offline', error);
        });
    }

    return;
  }

  /**
   * Prevent duplicate reconnect scheduling.
   */
  if (reconnecting) {
    return;
  }

  reconnecting = true;

  scheduleReconnect(async () => {
    reconnecting = false;

    try {
      await connect();
    } catch (error: unknown) {
      reconnecting = false;

      botStats.errors++;

      logHelper.error('whatsapp:reconnect', error);

      /**
       * If creating the new socket itself
       * fails, schedule another attempt.
       */
      void scheduleReconnect(connect);
    }
  }, statusCode);
}

export async function startBot(): Promise<BotInstance> {
  if (currentSocket) {
    logger.warn('WhatsApp bot is already running.');

    return {
      get sock(): WASocket {
        return currentSocket!;
      },

      stop: async () => {
        await stopBot();
      },

      getConnectionState: () => ({
        connection: currentSocket?.user ? 'open' : 'close',
      }),

      getUptime: calculateUptime,

      getStats: () => ({
        ...botStats,
        uptime: calculateUptime(),
      }),
    };
  }

  stopping = false;

  logger.info('🔌 Initializing WhatsApp connection...');

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

  logger.info(`📁 Session directory: ${config.sessionDir}`);

  /**
   * Startup intentionally does not call
   * fetchLatestBaileysVersion().
   *
   * Creating the socket should not depend
   * on an external version request.
   */
  const connect = (): Promise<void> => {
    if (stopping) {
      return Promise.resolve();
    }

    const sock = createSocket(state);

    currentSocket = sock;

    setupEventHandlers(sock, saveCreds, connect);

    logger.info('📡 WhatsApp socket initialized.');

    return Promise.resolve();
  };
  await connect();

  return {
    get sock(): WASocket {
      if (!currentSocket) {
        throw new Error('WhatsApp socket is not connected.');
      }

      return currentSocket;
    },

    stop: async () => {
      await stopBot();
    },

    getConnectionState: () => ({
      connection: currentSocket?.user ? 'open' : 'close',
    }),

    getUptime: calculateUptime,

    getStats: () => ({
      ...botStats,
      uptime: calculateUptime(),
    }),
  };
}

async function stopBot(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  reconnecting = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  cleanupSocketResources();

  const sock = currentSocket;

  currentSocket = undefined;

  if (!sock) {
    logger.info('WhatsApp connection already stopped.');

    return;
  }

  const uptime = calculateUptime();

  try {
    await sock.sendPresenceUpdate('unavailable');
  } catch {
    /**
     * Socket may already be closed.
     */
  }

  try {
    /**
     * Baileys expects a string reason.
     *
     * Do NOT use:
     * sock.end(undefined)
     */
    sock.end(new Error('Application shutdown'));
  } catch (error: unknown) {
    logHelper.error('whatsapp:stop', error);
  }

  if (config.notifyOnStop) {
    void notificationService
      .sendBotOfflineNotification('applicationShutdown', uptime)
      .catch((error: unknown) => {
        logHelper.error('notification:bot-offline', error);
      });
  }

  logger.info('✅ WhatsApp connection stopped.');
}

export {
  calculateBackoffDelay,
  getDisconnectStatusCode,
  shouldAttemptReconnect,
  reconnectConfig as DEFAULT_RECONNECT_CONFIG,
};
