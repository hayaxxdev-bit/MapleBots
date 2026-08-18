// src/handlers/message-handler.ts
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import { logger, logHelper } from '../../infrastructure/logging/logger';
import { config } from '../../config/config';
import { StringHelper } from '../../utils/helper';
import RateLimiter from '../../infrastructure/rate-limit/rate-limiter';
import { handleIncomingMessage as handleCommandMessage } from './command-handler';
import type { ChatType, MessageLogContext } from '../../infrastructure/logging/logger';

/**
 * Extract message text from various message types.
 */
function extractMessageText(message: WAMessage): string {
  try {
    const msgContent = message.message;
    if (!msgContent) {
      return '';
    }

    return (
      msgContent.conversation ??
      msgContent.extendedTextMessage?.text ??
      msgContent.imageMessage?.caption ??
      msgContent.videoMessage?.caption ??
      msgContent.documentMessage?.caption ??
      ''
    );
  } catch (error) {
    logHelper.error('extract-text', error);
    return '';
  }
}

/**
 * Extract message type.
 */
function extractMessageType(message: WAMessage): string {
  const msgContent = message.message;
  if (!msgContent) {
    return 'unknown';
  }

  if (msgContent.conversation) {
    return 'text';
  }
  if (msgContent.extendedTextMessage) {
    return 'text';
  }
  if (msgContent.imageMessage) {
    return 'image';
  }
  if (msgContent.videoMessage) {
    return 'video';
  }
  if (msgContent.audioMessage) {
    return 'audio';
  }
  if (msgContent.documentMessage) {
    return 'document';
  }
  if (msgContent.stickerMessage) {
    return 'sticker';
  }
  if (msgContent.contactMessage) {
    return 'contact';
  }
  if (msgContent.locationMessage) {
    return 'location';
  }
  if (msgContent.reactionMessage) {
    return 'reaction';
  }

  return 'other';
}

/**
 * Extract sender JID from message.
 */
function extractSender(message: WAMessage): string {
  const sender = message.key.remoteJid || '';
  const participant = message.key.participant;

  if (sender.endsWith('@g.us') && participant) {
    return participant;
  }

  return sender;
}

/**
 * Get chat type.
 */
function getChatType(chatId: string): ChatType {
  if (chatId.endsWith('@g.us')) {
    return 'group';
  }
  if (chatId === 'status@broadcast') {
    return 'status';
  }
  if (chatId.endsWith('@broadcast')) {
    return 'broadcast';
  }
  return 'private';
}

/**
 * Get sender name from message.
 */
function extractSenderName(message: WAMessage): string | undefined {
  return message.pushName || undefined;
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
  const ownerNumbers = [config.ownerNumber, ...config.adminNumbers].map((num) =>
    num.replace(/[^0-9]/g, '')
  );

  return ownerNumbers.includes(senderNumber);
}

/**
 * Check if sender is group admin.
 */
async function isGroupAdmin(sock: WASocket, groupId: string, sender: string): Promise<boolean> {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    const admins = groupMetadata.participants.filter((p) => p.admin).map((p) => p.id);

    return admins.includes(sender);
  } catch (error) {
    logHelper.error('check-admin', error);
    return false;
  }
}

/**
 * Get group name.
 */
async function getGroupName(sock: WASocket, groupId: string): Promise<string | undefined> {
  try {
    const groupMetadata = await sock.groupMetadata(groupId);
    return groupMetadata.subject;
  } catch (error) {
    return undefined;
  }
}

/**
 * Check if message contains any bot prefix.
 */
function hasBotPrefix(text: string): boolean {
  const prefixes = [config.prefix, ...config.prefixAlt];
  return prefixes.some((prefix) => text.startsWith(prefix));
}

/**
 * Handle auto behaviors (read, typing, recording).
 */
async function handleAutoBehaviors(
  sock: WASocket,
  chatId: string,
  isGroup: boolean,
  message: WAMessage
): Promise<void> {
  try {
    if (config.autoRead) {
      await sock.readMessages([message.key]);
    }

    if (config.autoTyping && !isGroup) {
      await sock.sendPresenceUpdate('composing', chatId);
      setTimeout(() => {
        void (async () => {
          try {
            await sock.sendPresenceUpdate('paused', chatId);
          } catch (error) {
            // Ignore errors
          }
        })();
      }, 3000);
    }
  } catch (error) {
    logHelper.error('auto-behaviors', error);
  }
}

/**
 * Main message handler entry point.
 */
export async function handleIncomingMessage(sock: WASocket, message: WAMessage): Promise<void> {
  try {
    // Validate message
    if (!message.message || message.key.fromMe) {
      return;
    }

    // Extract message info
    const chatId = message.key.remoteJid || '';
    const sender = extractSender(message);
    const senderName = extractSenderName(message);
    const text = extractMessageText(message).trim();
    const messageType = extractMessageType(message);
    const chatType = getChatType(chatId);
    const isGroup = chatType === 'group';
    const groupId = isGroup ? chatId : undefined;

    // Get group name if group message
    let groupName: string | undefined;
    if (isGroup) {
      groupName = await getGroupName(sock, chatId);
    }

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

    // LOG INCOMING MESSAGE (PENTING!)
    const messageLogContext: MessageLogContext = {
      chatId,
      sender,
      senderName,
      chatType,
      groupName,
      groupId,
      messageType,
      text: text || `[${messageType}]`,
      isCommand: hasBotPrefix(text),
      timestamp: new Date(),
    };

    logHelper.incomingMessage(messageLogContext);

    // Handle empty messages
    if (!text) {
      if (config.autoRead) {
        await sock.readMessages([message.key]);
      }
      return;
    }

    // Check if message is command
    if (hasBotPrefix(text)) {
      const commandName = text.slice(config.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();

      if (!commandName) {
        return;
      }

      // Check blocked commands
      if (config.blockedCommands.includes(commandName)) {
        logger.debug(`Blocked command: ${commandName}`);
        return;
      }

      // Check rate limit
      const rateLimiter = RateLimiter.getInstance();

      if (config.rateLimitEnabled) {
        if (rateLimiter.isRateLimited(sender)) {
          await sock.sendMessage(
            chatId,
            {
              text: '⚠️ Terlalu banyak permintaan. Silakan tunggu sebentar.',
            },
            { quoted: message }
          );

          logHelper.warn('rate-limit', `User ${sender.replace(/[^0-9]/g, '')} rate limited`);
          return;
        }

        if (rateLimiter.isOnCooldown(sender, commandName)) {
          const remaining = rateLimiter.getCooldownRemaining(sender, commandName);
          await sock.sendMessage(
            chatId,
            {
              text: `⏳ Command "${commandName}" masih cooldown. Tunggu ${Math.ceil(remaining / 1000)} detik.`,
            },
            { quoted: message }
          );
          return;
        }
      }

      // Log command
      logHelper.command({
        sender,
        command: commandName,
        args: text.split(/\s+/).slice(1),
      });

      // Process command
      await handleCommandMessage(sock, message);
    } else {
      // Regular message (not command)
      logger.debug(
        {
          chatId,
          sender,
          chatType,
          text: StringHelper.truncate(text, 100),
        },
        'Regular message (not command)'
      );
    }

    // Handle auto behaviors
    await handleAutoBehaviors(sock, chatId, isGroup, message);
  } catch (error) {
    logHelper.error('handle-message', error);
  }
}

// Export helpers for testing
export {
  extractMessageText,
  extractMessageType,
  extractSender,
  extractSenderName,
  getChatType,
  isGroupMessage,
  isOwner,
  isGroupAdmin,
  getGroupName,
  hasBotPrefix,
};
