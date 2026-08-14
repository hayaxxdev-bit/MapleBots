// src/utils/database.ts
import fs from 'fs';
import path from 'path';
import { config } from '../config/config';
import { logger } from './logger';

interface DatabaseAdapter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/**
 * JSON Database Adapter
 */
class JsonDatabase implements DatabaseAdapter {
  private data: Record<string, unknown> = {};
  private filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content);
      }
    } catch (error) {
      logger.error(error as Error, 'Failed to load JSON database');
      this.data = {};
    }
  }

  private async save(): Promise<void> {
    const saveOperation = async () => {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        const tempFile = `${this.filePath}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
        fs.renameSync(tempFile, this.filePath);
      } catch (error) {
        logger.error(error as Error, 'Failed to save JSON database');
        throw error;
      }
    };

    this.writeQueue = this.writeQueue.then(saveOperation);
    await this.writeQueue;
  }

  async get(key: string): Promise<unknown> {
    return this.data[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    await this.save();
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    await this.save();
  }

  async clear(): Promise<void> {
    this.data = {};
    await this.save();
  }

  async close(): Promise<void> {
    await this.save();
  }
}

/**
 * SQLite Database Adapter
 */
class SqliteDatabase implements DatabaseAdapter {
  private db: any; // Would use better-sqlite3 in production

  constructor(filePath: string) {
    // Implementation would use better-sqlite3
    logger.warn('SQLite database not fully implemented, using JSON fallback');
    this.db = new JsonDatabase(filePath.replace('.db', '.json'));
  }

  async get(key: string): Promise<unknown> {
    return this.db.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.set(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(key);
  }

  async clear(): Promise<void> {
    await this.db.clear();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/**
 * Database Manager
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private adapter: DatabaseAdapter;
  private collections: Map<string, Map<string, unknown>> = new Map();

  private constructor() {
    const dbPath = config.databasePath;
    
    switch (config.databaseType) {
      case 'sqlite':
        this.adapter = new SqliteDatabase(dbPath);
        break;
      case 'json':
      default:
        this.adapter = new JsonDatabase(dbPath);
        break;
    }
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async initialize(): Promise<void> {
    logger.info(`Database initialized (${config.databaseType})`);
  }

  async get(collection: string, key: string): Promise<unknown> {
    const fullKey = `${collection}:${key}`;
    return this.adapter.get(fullKey);
  }

  async set(collection: string, key: string, value: unknown): Promise<void> {
    const fullKey = `${collection}:${key}`;
    await this.adapter.set(fullKey, value);
  }

  async delete(collection: string, key: string): Promise<void> {
    const fullKey = `${collection}:${key}`;
    await this.adapter.delete(fullKey);
  }

  async clearCollection(collection: string): Promise<void> {
    const prefix = `${collection}:`;
    // Would need to implement key scanning for full collection clear
    await this.adapter.delete(prefix);
  }

  async clearAll(): Promise<void> {
    await this.adapter.clear();
  }

  async close(): Promise<void> {
    await this.adapter.close();
    logger.info('Database closed');
  }

  // Helper methods for common operations
  async getUserData(userId: string): Promise<Record<string, unknown>> {
    const data = await this.get('users', userId);
    return (data as Record<string, unknown>) || {};
  }

  async setUserData(userId: string, data: Record<string, unknown>): Promise<void> {
    await this.set('users', userId, data);
  }

  async incrementCounter(key: string, amount = 1): Promise<number> {
    const current = ((await this.get('counters', key)) as number) || 0;
    const newValue = current + amount;
    await this.set('counters', key, newValue);
    return newValue;
  }
}

// Export singleton instance
export default DatabaseManager;