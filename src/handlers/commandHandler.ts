// src/handlers/commandHandler.ts
import type { WASocket, proto } from '@whiskeysockets/baileys';
import { config } from '../config/config';
import { logger, logHelper } from '../utils/logger';
import type { Command, CommandContext, MediaType } from '../types';

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

/**
 * Registry pusat seluruh command.
 * Menambah fitur baru = tambah satu entry di sini + buat file handler-nya.
 */
export const commands: readonly Command[] = Object.freeze([
  tiktokCommand,
  tiktokAudioCommand,
  youtubeCommand,
  youtubeAudioCommand,
  instagramCommand,
  facebookCommand,
  generalDownloadCommand,
  traceAnimeCommand,
  animeInfoCommand,
  mangaInfoCommand,
  wallpaperCommand,
  helpCommand,
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
 * Get command by name or alias.
 */
export function getCommand(name: string): Command | undefined {
  return commandMap.get(name.toLowerCase());
}

/**
 * Ekstrak teks dari berbagai tipe pesan Baileys.
 */
function extractText(msg: proto.IWebMessageInfo): string {
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
  if (!text.startsWith(config.prefix)) {
    return null;
  }
  
  const withoutPrefix = text.slice(config.prefix.length).trim();
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
function isValidChat(msg: proto.IWebMessageInfo): boolean {
  if (!msg.message || msg.key.fromMe) {
    return false;
  }
  
  const chatId = msg.key.remoteJid;
  if (!chatId || chatId === 'status@broadcast') {
    return false;
  }
  
  return true;
}

/**
 * Create reply helper.
 */
function createReplyHelper(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
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
 * Create reply media helper.
 */
function createReplyMediaHelper(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  chatId: string,
): (buffer: Buffer, type: MediaType, caption?: string) => Promise<void> {
  return async (buffer: Buffer, type: MediaType, caption?: string): Promise<void> => {
    try {
      switch (type) {
        case 'video':
          await sock.sendMessage(
            chatId,
            { video: buffer, caption },
            { quoted: msg },
          );
          break;
          
        case 'audio':
          await sock.sendMessage(
            chatId,
            { 
              audio: buffer, 
              mimetype: 'audio/mpeg',
              ptt: false,
            },
            { quoted: msg },
          );
          break;
          
        case 'image':
          await sock.sendMessage(
            chatId,
            { image: buffer, caption },
            { quoted: msg },
          );
          break;
          
        case 'document':
          await sock.sendMessage(
            chatId,
            {
              document: buffer,
              mimetype: 'application/octet-stream',
              fileName: caption ?? 'file',
            },
            { quoted: msg },
          );
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
  msg: proto.IWebMessageInfo,
  chatId: string,
  sender: string,
  args: string[],
  fullText: string,
): CommandContext {
  return {
    sock,
    msg,
    chatId,
    sender,
    args,
    fullText,
    reply: createReplyHelper(sock, msg, chatId),
    replyMedia: createReplyMediaHelper(sock, msg, chatId),
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
  msg: proto.IWebMessageInfo,
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