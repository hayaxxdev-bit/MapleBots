// src/infrastructure/notification/whatsapp-channel.ts

import type { WASocket } from '@whiskeysockets/baileys';

import { logger } from '../logging/logger';
import { config } from '../../config/config';

import type { NotificationChannel, NotificationPayload } from './notification-types';

export class WhatsAppNotificationChannel implements NotificationChannel {
  readonly name = 'whatsapp';

  constructor(private readonly getSocket: () => WASocket | undefined) {}

  async send(payload: NotificationPayload): Promise<void> {
    const sock = this.getSocket();

    if (!sock) {
      throw new Error('WhatsApp socket not initialized');
    }

    const ownerNumber = this.formatNumber(config.ownerNumber);

    if (!ownerNumber) {
      throw new Error('Owner WhatsApp number is not configured');
    }

    const adminNumbers = config.adminNumbers
      .map((number) => this.formatNumber(number))
      .filter(Boolean);

    const message = this.formatMessage(payload);

    // ----------------------------------------------------------
    // Owner
    // ----------------------------------------------------------

    await this.sendToNumber(sock, ownerNumber, message);

    // ----------------------------------------------------------
    // Admins
    // ----------------------------------------------------------

    if (payload.priority === 'critical' || payload.priority === 'high') {
      for (const adminNumber of adminNumbers) {
        if (adminNumber === ownerNumber) {
          continue;
        }

        await this.sendToNumber(sock, adminNumber, message);
      }
    }
  }

  private async sendToNumber(sock: WASocket, number: string, message: string): Promise<void> {
    const jid = `${number}@s.whatsapp.net`;

    try {
      await sock.sendMessage(jid, {
        text: message,
      });

      logger.debug(`Notification sent to ${number}`);
    } catch (error) {
      logger.error(error, `Failed to send notification to ${number}`);

      throw error;
    }
  }

  private formatMessage(payload: NotificationPayload): string {
    const emoji = this.getEmojiForType(payload.type);

    const timestamp = payload.timestamp.toLocaleString('id-ID', {
      timeZone: config.timezone,
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    let message = `${emoji} *${payload.title}*\n\n`;

    message += payload.message;

    message += '\n\n━━━━━━━━━━━━━━━';

    message += `\n⏰ ${timestamp}`;

    message += `\n📊 Priority: ${payload.priority.toUpperCase()}`;

    if (payload.metadata && Object.keys(payload.metadata).length > 0) {
      message += '\n\n📋 *Metadata:*';

      for (const [key, value] of Object.entries(payload.metadata)) {
        let formattedValue = String(value);

        if (formattedValue.length > 100) {
          formattedValue = formattedValue.slice(0, 100) + '...';
        }

        message += `\n${key}: ${formattedValue}`;
      }
    }

    return message;
  }

  private getEmojiForType(type: string): string {
    const emojiMap: Record<string, string> = {
      bot_online: '✅',
      bot_offline: '🔴',
      error: '⚠️',
      crash: '💥',
      database_backup: '💾',
      health_check: '🏥',
      security_alert: '🔒',
      update_available: '📦',
      rate_limit: '🚫',
      scraper_error: '🔍',
    };

    return emojiMap[type] ?? '📢';
  }

  private formatNumber(number: string): string {
    let cleaned = number.replace(/\D/g, '');

    if (!cleaned) {
      return '';
    }

    cleaned = cleaned.replace(/^0+/, '');

    if (!cleaned.startsWith('62')) {
      cleaned = `62${cleaned}`;
    }

    return cleaned;
  }
}
