// src/utils/helper.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/config';
import { logger } from '../infrastructure/logging/logger';

/**
 * File helper utilities
 */
export const FileHelper = {
  ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  },

  async deleteFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (error) {
      logger.error(error as Error, `Failed to delete file: ${filePath}`);
    }
  },

  async cleanupDirectory(dirPath: string, maxAgeMinutes: number): Promise<number> {
    let cleanedCount = 0;

    try {
      if (!fs.existsSync(dirPath)) {
        return 0;
      }

      const files = await fs.promises.readdir(dirPath);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        const ageMinutes = (now - stats.mtimeMs) / (60 * 1000);

        if (ageMinutes > maxAgeMinutes) {
          await this.deleteFile(filePath);
          cleanedCount++;
        }
      }
    } catch (error) {
      logger.error(error as Error, 'Failed to cleanup directory');
    }

    return cleanedCount;
  },

  getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  },

  formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },
};

/**
 * String helper utilities
 */
export const StringHelper = {
  truncate(str: string, length: number): string {
    if (str.length <= length) {
      return str;
    }
    return str.substring(0, length - 3) + '...';
  },

  slugify(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  formatNumber(num: number): string {
    return num.toLocaleString('id-ID');
  },

  parseCommand(message: string): { command: string; args: string[] } {
    const parts = message.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);
    return { command, args };
  },

  /**
   * Mengubah ukuran bytes menjadi format teks rapi (KB, MB, GB)
   */
  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  /**
   * Memeriksa apakah sebuah string adalah URL valid
   */
  isUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Validation helpers
 */
export const ValidationHelper = {
  isUrl(str: string): boolean {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  },

  isAllowedDomain(url: string): boolean {
    try {
      const domain = new URL(url).hostname;
      return config.allowedDomains.some((allowed) => {
        return domain === allowed || domain.endsWith(`.${allowed}`);
      });
    } catch {
      return false;
    }
  },

  isWhatsAppNumber(number: string): boolean {
    return /^\d{10,15}$/.test(number.replace(/[^0-9]/g, ''));
  },
};

/**
 * Time helpers
 */
export const TimeHelper = {
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  },

  getCurrentTime(): string {
    return new Date().toISOString();
  },
};

/**
 * Crypto helpers
 */
export const CryptoHelper = {
  hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  },

  md5(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  },

  randomString(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  },

  encrypt(text: string, password: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  },

  decrypt(text: string, password: string): string {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex || '', 'hex');
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted || '', 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  },
};

/**
 * Queue helper for rate limiting
 */
export class Queue {
  private queue: Array<() => Promise<unknown>> = [];
  private processing = false;
  private maxConcurrent: number;
  private activeCount = 0;

  constructor(maxConcurrent = config.concurrentDownloads) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing || this.activeCount >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) {
        continue;
      }

      this.activeCount++;
      try {
        await task();
      } catch (error) {
        logger.error(error as Error, 'Queue task error');
      } finally {
        this.activeCount--;
      }
    }

    this.processing = false;
  }

  get size(): number {
    return this.queue.length;
  }
}

// Export all helpers
export default {
  FileHelper,
  StringHelper,
  ValidationHelper,
  TimeHelper,
  CryptoHelper,
  Queue,
};
