import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logging/logger';
import { config } from '../../config/config';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private data: Record<string, unknown> = {};
  private dbPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor() {
    this.dbPath = path.resolve(config.databasePath);
    this.ensureDirectory();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.dbPath)) {
        const content = await fs.promises.readFile(this.dbPath, 'utf-8');
        this.data = JSON.parse(content) as Record<string, unknown>;
      } else {
        this.data = {};
        await this.save();
      }
      logger.info(`Database initialized (${config.databaseType})`);
    } catch (error) {
      logger.error({ error }, 'Failed to initialize database:');
      this.data = {};
      await this.save();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await fs.promises.access(this.dbPath, fs.constants.R_OK | fs.constants.W_OK);
      const content = await fs.promises.readFile(this.dbPath, 'utf-8');
      JSON.parse(content);
      return true;
    } catch (error) {
      logger.warn({ error }, 'Database ping failed:');
      return false;
    }
  }

  get<T = unknown>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.data[key] as T | undefined);
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
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

  getAll(): Promise<Record<string, unknown>> {
    return Promise.resolve(this.data);
  }

  private async save(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await fs.promises.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (error) {
        logger.error({ error }, 'Failed to save database:');
        throw error;
      }
    });

    return this.writeQueue;
  }

  async close(): Promise<void> {
    await this.writeQueue;
    logger.info('Database connection closed');
  }

  async dispose(): Promise<void> {
    await this.close();
  }
}
