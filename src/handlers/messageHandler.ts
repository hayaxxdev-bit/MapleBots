// src/handlers/message-handler.ts
import type { WASocket, WAMessage, proto } from '@whiskeysockets/baileys';
import { logger, logHelper } from '../utils/logger';
import { config } from '../config/config';
import { StringHelper, ValidationHelper } from '../utils/helper';
import RateLimiter from '../utils/rate-limiter';
import { handleIncomingMessage as handleCommandMessage } from './commandHandler';

/**
 * Extract message text from various message types.
 */
function extractMessageText(message: WAMessage): string {
  try {
    const msgContent = message.message;
    
    if (!msgContent) return '';
    
    // Extract text from different message types
    if (msgContent.conversation) return msgContent.conversation;
    if (msgContent.extendedTextMessage?.text) return msgContent.extendedTextMessage.text;
    if (msgContent.imageMessage?.caption) return msgContent.imageMessage.caption;
    if (msgContent.videoMessage?.caption) return msgContent.videoMessage.caption;
    if (msgContent.documentMessage?.caption) return msgContent.documentMessage.caption;
    
    return '';
  } catch (error) {
    logHelper.error('extract-text', error);
    return '';
  }
}

/**
 * Extract sender JID from message.
 */
function extractSender(message: WAMessage): string {
  const sender = message.key.remoteJid || '';
  const participant = message.key.participant;
  
  // If message is from group, use participant JID
  if (sender.endsWith('@g.us') && participant) {
    return participant;
  }
  
  return sender;
}

/**
 * Check if message is from group.
 */
function isGroupMessage(chatId: string): boolean {
  return chatId.endsWith('@g.us');
}

/**
 * Check if sender is bot owner or admin.
 */
function isOwner(sender: string): boolean {
  const senderNumber = sender.replace(/[^0-9]/g, '');
  const ownerNumbers = [
    config.ownerNumber,
    ...config.adminNumbers,
  ].map(num => num.replace(/[^0-9]/g, ''));
  
  return ownerNumbers.includes(senderNumber);
}

/**
 * Check if sender is group admin.
 */
async function isGroupAdmin(
  sock: WASocket,
  groupId: string,
  sender: string,
): Promise<boolean> {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const admins = groupMetadata.participants
      .filter(p => p.admin)
      .map(p => p.id);
    
    return admins.includes(sender);
  } catch (error) {
    logHelper.error('check-admin', error);
    return false;
  }
}

/**
 * Check if message contains any bot prefix.
 */
function hasBotPrefix(text: string): boolean {
  const prefixes = [config.prefix, ...config.prefixAlt];
  return prefixes.some(prefix => text.startsWith(prefix));
}

/**
 * Extract command name from message text.
 */
function extractCommandName(text: string): string | null {
  if (!hasBotPrefix(text)) return null;
  
  const prefix = [config.prefix, ...config.prefixAlt].find(p => text.startsWith(p));
  if (!prefix) return null;
  
  const withoutPrefix = text.slice(prefix.length).trim();
  const [rawCommand] = withoutPrefix.split(/\s+/);
  
  return rawCommand ? rawCommand.toLowerCase() : null;
}

/**
 * Check if command is blocked.
 */
function isBlockedCommand(command: string): boolean {
  return config.blockedCommands.includes(command);
}

/**
 * Handle auto behaviors (read, typing, recording).
 */
async function handleAutoBehaviors(
  sock: WASocket,
  chatId: string,
  isGroup: boolean,
  message: WAMessage,
): Promise<void> {
  try {
    // Auto read
    if (config.autoRead) {
      await sock.readMessages([message.key]);
    }
    
    // Auto typing (only in private chat)
    if (config.autoTyping && !isGroup) {
      await sock.sendPresenceUpdate('composing', chatId);
      
      // Clear typing after 3 seconds
      setTimeout(async () => {
        try {
          await sock.sendPresenceUpdate('paused', chatId);
        } catch (error) {
          // Ignore errors
        }
      }, 3000);
    }
    
    // Auto recording (only in private chat)
    if (config.autoRecording && !isGroup) {
      await sock.sendPresenceUpdate('recording', chatId);
      
      // Clear recording after 3 seconds
      setTimeout(async () => {
        try {
          await sock.sendPresenceUpdate('paused', chatId);
        } catch (error) {
          // Ignore errors
        }
      }, 3000);
    }
  } catch (error) {
    logHelper.error('auto-behaviors', error);
  }
}

/**
 * Handle non-command messages (optional, for future features).
 */
async function handleRegularMessage(
  sock: WASocket,
  message: WAMessage,
  chatId: string,
  sender: string,
  text: string,
  isGroup: boolean,
): Promise<void> {
  // This function can be used for:
  // - Auto-reply features
  // - Keyword detection
  // - AI chat (if enabled)
  // - Other non-command features
  
  // For now, just log and ignore
  logger.debug({
    chatId,
    sender,
    text: StringHelper.truncate(text, 100),
    isGroup,
  }, 'Regular message (not command)');
}

/**
 * Main message handler entry point.
 */
export async function handleIncomingMessage(
  sock: WASocket,
  message: WAMessage,
): Promise<void> {
  try {
    // Validate message
    if (!message.message || message.key.fromMe) {
      return;
    }
    
    // Extract message info
    const chatId = message.key.remoteJid || '';
    const sender = extractSender(message);
    const text = extractMessageText(message).trim();
    const isGroup = isGroupMessage(chatId);
    const groupId = isGroup ? chatId : undefined;
    
    // Validate chat
    if (!chatId || chatId === 'status@broadcast') {
      return;
    }
    
    // Check bot mode
    if (config.botMode === 'private' && isGroup) {
      return;
    }
    
    if (config.botMode === 'group_only' && !isGroup) {
      return;
    }
    
    // Check if group is allowed
    if (isGroup && config.allowedGroups.length > 0) {
      if (!config.allowedGroups.includes(chatId)) {
        return;
      }
    }
    
    // Check if message is empty
    if (!text) {
      // Still handle auto-read for empty messages
      if (config.autoRead) {
        await sock.readMessages([message.key]);
      }
      return;
    }
    
    // Log incoming message
    logger.debug({
      chatId,
      sender,
      text: StringHelper.truncate(text, 100),
      isGroup,
    }, 'Incoming message');
    
    // Check if message is command
    if (hasBotPrefix(text)) {
      const commandName = extractCommandName(text);
      
      if (!commandName) {
        return;
      }
      
      // Check blocked commands
      if (isBlockedCommand(commandName)) {
        logger.debug(`Blocked command: ${commandName}`);
        return;
      }
      
      // Check rate limit
      const rateLimiter = RateLimiter.getInstance();
      
      if (config.rateLimitEnabled) {
        if (rateLimiter.isRateLimited(sender)) {
          await sock.sendMessage(chatId, {
            text: '⚠️ Terlalu banyak permintaan. Silakan tunggu sebentar.',
          }, { quoted: message });
          return;
        }
        
        // Check command cooldown
        if (rateLimiter.isOnCooldown(sender, commandName)) {
          const remaining = rateLimiter.getCooldownRemaining(sender, commandName);
          await sock.sendMessage(chatId, {
            text: `⏳ Command "${commandName}" masih cooldown. Tunggu ${Math.ceil(remaining / 1000)} detik.`,
          }, { quoted: message });
          return;
        }
      }
      
      // Check if sender is owner/admin
      const ownerStatus = isOwner(sender);
      const adminStatus = isGroup ? await isGroupAdmin(sock, chatId, sender) : false;
      
      // Log command execution
      logHelper.command({
        sender,
        command: commandName,
        args: text.split(/\s+/).slice(1),
      });
      
      // Process command through command handler
      await handleCommandMessage(sock, message);
      
      // Update stats (if needed)
      logger.debug({ command: commandName, sender }, 'Command processed');
    } else {
      // Handle regular message (non-command)
      await handleRegularMessage(sock, message, chatId, sender, text, isGroup);
    }
    
    // Handle auto behaviors
    await handleAutoBehaviors(sock, chatId, isGroup, message);
    
  } catch (error) {
    logHelper.error('handle-message', error);
  }
}

/**
 * Export helper functions for testing.
 */
export {
  extractMessageText,
  extractSender,
  isGroupMessage,
  isOwner,
  isGroupAdmin,
  hasBotPrefix,
  extractCommandName,
  isBlockedCommand,
};