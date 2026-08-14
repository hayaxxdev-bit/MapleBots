// src/handlers/commandHandler.ts
import type { WASocket, proto, WAMessage } from '@whiskeysockets/baileys'; // MediaType dihapus dari sini untuk mencegah duplikat
import { config } from '../config/config';
import { logger, logHelper } from '../utils/logger';
import type { AudioOptions, Command, CommandContext, MediaOptions, MediaType, StickerOptions } from '../types';

// Import commands
import { tiktokCommand, tiktokAudioCommand } from '../commands/downloader/tiktok';
import { youtubeCommand, youtubeAudioCommand } from '../commands/downloader/youtube';
import { instagramCommand } from '../commands/downloader/instagram';
import { facebookCommand } from '../commands/downloader/facebook';
import { generalDownloadCommand } from '../commands/downloader/general';
import { traceAnimeCommand } from '../commands/anime/traceAnime';
import { animeInfoCommand, mangaInfoCommand } from '../commands/anime/animeInfo';
import { wallpaperCommand } from '../commands/anime/wallpaper';
import { helpCommand } from '../commands/general/help';
import { menuCommand } from '../commands/general/menu';
import { pingCommand } from '../commands/general/ping';

/**
 * Registry pusat seluruh command.
 * Menambah fitur baru = tambah satu entry di sini + buat file handler-nya.
 */
export const commands: readonly Command[] = Object.freeze([
  // Downloader commands
  tiktokCommand,
  tiktokAudioCommand,
  youtubeCommand,
  youtubeAudioCommand,
  instagramCommand,
  facebookCommand,
  generalDownloadCommand,
  
  // Anime commands
  traceAnimeCommand,
  animeInfoCommand,
  mangaInfoCommand,
  wallpaperCommand,
  
  // General commands
  helpCommand,
  menuCommand,
  pingCommand,
]);

/**
 * Map nama+alias -> command untuk lookup O(1).
 */
export const commandMap = createCommandMap(commands);

/**
 * Create command map dari array commands.
 */
function createCommandMap(commandList: readonly Command[]): ReadonlyMap<string, Command> {
  const map = new Map<string, Command>();
  
  for (const cmd of commandList) {
    // Register main command name
    map.set(cmd.name.toLowerCase(), cmd);
    
    // Register aliases
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        map.set(alias.toLowerCase(), cmd);
      }
    }
  }
  
  return map;
}

/**
 * Get all commands (for help command).
 */
export function getAllCommands(): readonly Command[] {
  return commands;
}

/**
 * Get commands by category.
 */
export function getCommandsByCategory(category: Command['category']): readonly Command[] {
  return commands.filter(cmd => cmd.category === category);
}

/**
 * Get command by name or alias.
 */
export function getCommand(name: string): Command | undefined {
  return commandMap.get(name.toLowerCase());
}

/**
 * Ekstrak teks dari berbagai tipe pesan Baileys.
 */
function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return '';
  
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    ''
  );
}

/**
 * Parse pesan untuk mendapatkan command dan args.
 */
interface ParsedCommand {
  commandName: string;
  args: string[];
  fullText: string;
}

function parseCommand(text: string): ParsedCommand | null {
  // Check all prefixes
  const prefixes = [config.prefix, ...config.prefixAlt];
  const matchedPrefix = prefixes.find(p => text.startsWith(p));
  
  if (!matchedPrefix) {
    return null;
  }
  
  const withoutPrefix = text.slice(matchedPrefix.length).trim();
  const [rawCommand, ...args] = withoutPrefix.split(/\s+/);
  
  if (!rawCommand) {
    return null;
  }
  
  return {
    commandName: rawCommand.toLowerCase(),
    args,
    fullText: args.join(' '),
  };
}

/**
 * Validasi chat sebelum diproses.
 */
function isValidChat(msg: WAMessage): boolean {
  if (!msg.message || !msg.key || msg.key.fromMe) {
    return false;
  }
  
  const chatId = msg.key.remoteJid;
  if (!chatId || chatId === 'status@broadcast') {
    return false;
  }
  
  return true;
}

/**
 * Check if sender is owner or admin.
 */
function isOwnerOrAdmin(sender: string): boolean {
  const senderNumber = sender.replace(/[^0-9]/g, '');
  const ownerNumbers = [
    config.ownerNumber,
    ...config.adminNumbers,
  ].map(num => num.replace(/[^0-9]/g, ''));
  
  return ownerNumbers.includes(senderNumber);
}

/**
 * Create reply helper with enhanced options.
 */
function createReplyHelper(
  sock: WASocket,
  msg: WAMessage,
  chatId: string,
): (text: string) => Promise<void> {
  return async (replyText: string): Promise<void> => {
    try {
      await sock.sendMessage(
        chatId,
        { text: replyText },
        { quoted: msg },
      );
    } catch (error) {
      logHelper.error('reply-text', error);
      throw error;
    }
  };
}

/**
 * Create reply media helper with enhanced options.
 */
function createReplyMediaHelper(
  sock: WASocket,
  msg: WAMessage,
  chatId: string,
): (buffer: Buffer, type: MediaType, caption?: string) => Promise<void> {
  return async (buffer: Buffer, type: MediaType, caption?: string): Promise<void> => {
    try {
      switch (type) {
        case 'video':
          await sock.sendMessage(chatId, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: msg });
          break;
        case 'audio':
          await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
          break;
        case 'image':
          await sock.sendMessage(chatId, { image: buffer, caption, mimetype: 'image/jpeg' }, { quoted: msg });
          break;
        case 'document':
          await sock.sendMessage(chatId, { document: buffer, mimetype: 'application/octet-stream', fileName: caption ?? 'file' }, { quoted: msg });
          break;
        case 'sticker':
          await sock.sendMessage(chatId, { sticker: buffer }, { quoted: msg });
          break;
        default:
          throw new Error(`Unsupported media type: ${type}`);
      }
    } catch (error) {
      logHelper.error('reply-media', error);
      throw error;
    }
  };
}

/**
 * Create command context.
 */
function createCommandContext(
  sock: WASocket,
  msg: WAMessage,
  chatId: string,
  sender: string,
  args: string[],
  fullText: string,
): CommandContext {
  const isGroup = chatId.endsWith('@g.us');
  const senderIsOwner = isOwnerOrAdmin(sender);
  
  // Perbaikan: Ratusan baris objek palsu dihapus dan dikembalikan ke fungsi sesungguhnya
  return {
    sock, // Socket diteruskan langsung, tidak perlu di-mock
    msg,
    chatId,
    sender,
    args,
    fullText,
    isGroup,
    isOwner: senderIsOwner,
    isAdmin: senderIsOwner,
    
    // Helpers
    reply: createReplyHelper(sock, msg, chatId),
    replyMedia: createReplyMediaHelper(sock, msg, chatId),
    
    // Explicit Media Helpers untuk mengatasi TypeScript Error TS2739
    replySticker: async (buffer: Buffer, options?: StickerOptions) => {
      await sock.sendMessage(chatId, { sticker: buffer, ...options }, { quoted: msg });
    },
    replyImage: async (buffer: Buffer, caption?: string) => {
      await sock.sendMessage(chatId, { image: buffer, caption, mimetype: 'image/jpeg' }, { quoted: msg });
    },
    replyVideo: async (buffer: Buffer, caption?: string) => {
      await sock.sendMessage(chatId, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: msg });
    },
    replyAudio: async (buffer: Buffer, options?: AudioOptions) => {
      await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', ptt: options?.ptt || false }, { quoted: msg });
    },
    replyDocument: async (buffer: Buffer, filename: string, caption?: string) => {
      await sock.sendMessage(chatId, { document: buffer, fileName: filename, caption, mimetype: 'application/octet-stream' }, { quoted: msg });
    },

    // Presence actions
    sendTyping: async () => {
      await sock.sendPresenceUpdate('composing', chatId);
    },
    sendRecording: async () => {
      await sock.sendPresenceUpdate('recording', chatId);
    },
    sendRead: async () => {
      await sock.readMessages([msg.key]);
    },
  };
}

/**
 * Execute command dengan error handling.
 */
async function executeCommand(
  command: Command,
  ctx: CommandContext,
): Promise<void> {
  try {
    if (command.isOwnerOnly && !ctx.isOwner) {
      await ctx.reply('⚠️ Command ini khusus owner!');
      return;
    }
    
    if (command.isAdminOnly && !ctx.isAdmin) {
      await ctx.reply('⚠️ Command ini khusus admin!');
      return;
    }
    
    if (command.isGroupOnly && !ctx.isGroup) {
      await ctx.reply('⚠️ Command ini hanya bisa digunakan di grup!');
      return;
    }
    
    if (command.isPrivateOnly && ctx.isGroup) {
      await ctx.reply('⚠️ Command ini hanya bisa digunakan di chat pribadi!');
      return;
    }
    
    // Execute command
    await command.handler(ctx);
    
  } catch (error) {
    logHelper.error(`command:${command.name}`, error);
    await ctx.reply(
      '❌ Terjadi kesalahan saat memproses perintah.\n' +
      'Pastikan format yang dikirim valid, lalu coba lagi.'
    );
  }
}

/**
 * Entry point untuk setiap pesan masuk.
 */
export async function handleIncomingMessage(
  sock: WASocket,
  msg: WAMessage,
): Promise<void> {
  // Validate message
  if (!isValidChat(msg)) {
    return;
  }
  
  const chatId = msg.key.remoteJid!;
  
  // Extract and parse text
  const text = extractText(msg).trim();
  const parsed = parseCommand(text);
  
  if (!parsed) {
    return;
  }
  
  // Lookup command
  const command = getCommand(parsed.commandName);
  if (!command) {
    logger.debug(`Unknown command: ${parsed.commandName}`);
    return;
  }
  
  // Extract sender info
  const sender = msg.key.participant ?? msg.key.remoteJid ?? '';
  
  // Create command context
  const ctx = createCommandContext(
    sock,
    msg,
    chatId,
    sender,
    parsed.args,
    parsed.fullText,
  );
  
  // Log command execution
  logHelper.command({
    sender,
    command: parsed.commandName,
    args: parsed.args,
  });
  
  // Execute command
  await executeCommand(command, ctx);
}