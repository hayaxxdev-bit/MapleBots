// src/connection/connection.ts
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  ConnectionState,
  BaileysEventMap,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { baileysLogger, logger, logHelper } from '../utils/logger';
import { config } from '../config/config';
import { handleIncomingMessage } from '../handlers/commandHandler';

/**
 * Interface untuk bot instance.
 */
export interface BotInstance {
  readonly sock: WASocket;
  readonly stop: () => Promise<void>;
  readonly getConnectionState: () => ConnectionState;
}

/**
 * Reconnection configuration.
 */
interface ReconnectConfig {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
}

/**
 * Default reconnection configuration.
 */
const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  baseDelay: 1000,
  maxDelay: 30000,
} as const;

/**
 * Track reconnection attempts.
 */
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | undefined;

/**
 * Reset reconnection attempts after successful connection.
 */
function resetReconnectAttempts(): void {
  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

/**
 * Calculate exponential backoff delay.
 */
function calculateBackoffDelay(attempt: number, config: ReconnectConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  return Math.min(exponentialDelay, config.maxDelay);
}

/**
 * Handle connection updates.
 */
function handleConnectionUpdate(
  update: Partial<BaileysEventMap['connection.update']>,
  onReconnect: () => Promise<void>,
): void {
  const { connection, lastDisconnect, qr } = update;

  // Handle QR code generation
  if (qr) {
    logger.info('📱 Scan QR code berikut dengan WhatsApp di HP kamu:');
    qrcode.generate(qr, { small: true });
  }

  // Handle connection close
  if (connection === 'close') {
    const statusCode = getDisconnectStatusCode(lastDisconnect);
    const shouldReconnect = shouldAttemptReconnect(statusCode);

    if (shouldReconnect) {
      logHelper.warn('connection', `Koneksi terputus (code: ${statusCode}). Mencoba reconnect...`);
      
      const delay = calculateBackoffDelay(reconnectAttempts, DEFAULT_RECONNECT_CONFIG);
      reconnectAttempts++;
      
      if (reconnectAttempts > DEFAULT_RECONNECT_CONFIG.maxAttempts) {
        logger.error('Max reconnection attempts reached. Stopping bot.');
        process.exit(1);
      }
      
      logger.info(`Reconnecting dalam ${delay}ms (attempt ${reconnectAttempts}/${DEFAULT_RECONNECT_CONFIG.maxAttempts})`);
      
      reconnectTimer = setTimeout(() => {
        onReconnect().catch((error: unknown) => {
          logHelper.error('reconnect', error);
        });
      }, delay);
    } else {
      logger.error('❌ Sesi logout. Hapus folder sessions/ lalu scan ulang QR.');
      process.exit(0);
    }
  }

  // Handle successful connection
  if (connection === 'open') {
    resetReconnectAttempts();
    logger.info('✅ Bot berhasil terhubung ke WhatsApp!');
  }
}

/**
 * Extract disconnect status code from lastDisconnect.
 */
function getDisconnectStatusCode(lastDisconnect?: ConnectionState['lastDisconnect']): number | undefined {
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
  messages: BaileysEventMap['messages.upsert']['messages'],
): Promise<void> {
  for (const msg of messages) {
    try {
      await handleIncomingMessage(sock, msg);
    } catch (error) {
      logHelper.error('message-processing', error);
    }
  }
}

/**
 * Setup event handlers untuk socket.
 */
function setupEventHandlers(sock: WASocket, onReconnect: () => Promise<void>): void {
  // Save credentials on update
  sock.ev.on('creds.update', (creds) => {
    logger.debug('Credentials updated');
    // creds will be saved by useMultiFileAuthState
  });

  // Handle connection updates
  sock.ev.on('connection.update', (update) => {
    handleConnectionUpdate(update, onReconnect);
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') {
      return;
    }
    
    await processMessages(sock, messages);
  });

  // Handle other events
  sock.ev.on('messages.update', (updates) => {
    logger.debug({ count: updates.length }, 'Messages updated');
  });

  sock.ev.on('presence.update', (presence) => {
    logger.debug({ presence }, 'Presence updated');
  });
}

/**
 * Membuat & mengelola koneksi socket WhatsApp.
 * 
 * Features:
 * - Multi-file auth state untuk persistent sessions
 * - Auto-reconnect dengan exponential backoff
 * - Graceful shutdown
 * - Comprehensive error handling
 * 
 * @returns Promise<BotInstance> - Bot instance dengan socket dan control methods
 */
export async function startBot(): Promise<BotInstance> {
  try {
    // Setup authentication
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    logger.info(`📦 Menggunakan Baileys versi ${version.join('.')}${isLatest ? ' (latest)' : ' (update tersedia)'}`);

    // Create WhatsApp socket
    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      browser: [config.botName, 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true,
      syncFullHistory: false,
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Reconnection function
    const reconnect = async (): Promise<void> => {
      await startBot();
    };

    // Setup all event handlers
    setupEventHandlers(sock, reconnect);

    // Return bot instance with control methods
    return {
      sock,
      stop: async (): Promise<void> => {
        logger.info('Stopping bot connection...');
        resetReconnectAttempts();
        try {
          sock.end(undefined);
          logger.info('✅ Bot stopped successfully');
        } catch (error) {
          logHelper.error('stop-bot', error);
          throw error;
        }
      },
      getConnectionState: (): ConnectionState => {
        return sock.user ? 'open' : 'close';
      },
    };
  } catch (error) {
    logHelper.error('start-bot', error);
    throw new Error('Failed to start bot connection');
  }
}