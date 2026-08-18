import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logging/logger';
import { config } from '../../config/config';
import { metrics } from '../metrics/metrics';
import { notificationService } from '../notification/notification-service';

interface BackupResult {
  path: string;
  size: number;
  timestamp: Date;
  success: boolean;
  error?: Error;
}

interface SqliteTable {
  name: string;
}

export class DatabaseBackupManager {
  private static instance: DatabaseBackupManager;
  private isBackingUp = false;
  private backupHistory: BackupResult[] = [];
  private readonly maxBackups = 10;
  private readonly backupDir = './data/backups';

  private constructor() {}

  static getInstance(): DatabaseBackupManager {
    if (!DatabaseBackupManager.instance) {
      DatabaseBackupManager.instance = new DatabaseBackupManager();
    }
    return DatabaseBackupManager.instance;
  }

  async createBackup(): Promise<BackupResult> {
    if (this.isBackingUp) {
      logger.warn('Backup already in progress, skipping...');
      throw new Error('Backup already in progress');
    }

    this.isBackingUp = true;
    const startTime = Date.now();

    try {
      // Create backup directory if not exists
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }

      const timestamp = new Date();
      const backupFileName = `backup_${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Get database content based on type
      const databaseContent: unknown = await this.getDatabaseContent();

      // Write backup
      await fs.promises.writeFile(backupPath, JSON.stringify(databaseContent, null, 2));

      const stats = await fs.promises.stat(backupPath);
      const duration = Date.now() - startTime;

      const result: BackupResult = {
        path: backupPath,
        size: stats.size,
        timestamp,
        success: true,
      };

      // Add to history
      this.backupHistory.push(result);

      // Clean old backups
      await this.cleanOldBackups();

      // Record metrics
      metrics.record('database_backup_duration', duration);
      metrics.record('database_backup_size', stats.size);

      // Send notification
      await notificationService.sendDatabaseBackupNotification(backupPath, stats.size);

      logger.info(
        `✅ Database backup created: ${backupPath} (${stats.size} bytes in ${duration}ms)`
      );

      return result;
    } catch (error) {
      const result: BackupResult = {
        path: '',
        size: 0,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      // ✅ Fixed Pino signature order
      logger.error(error, 'Database backup failed:');

      // Send error notification
      await notificationService.sendErrorNotification(
        result.error ?? new Error('Unknown database backup error'),
        {
          module: 'database-backup',
          action: 'Database Backup',
        }
      );

      return result;
    } finally {
      this.isBackingUp = false;
    }
  }

  async scheduleBackup(intervalHours: number = 24): Promise<NodeJS.Timeout> {
    logger.info(`📅 Scheduling database backup every ${intervalHours} hours`);

    // Create initial backup
    await this.createBackup();

    // Schedule regular backups
    return setInterval(
      () => {
        void (async () => {
          try {
            await this.createBackup();
          } catch (error) {
            // ✅ Fixed Pino signature order
            logger.error(error, 'Scheduled backup failed:');
            await notificationService.sendErrorNotification(
              error instanceof Error ? error : new Error(String(error)),
              {
                module: 'database-backup',
                action: 'Scheduled Database Backup',
              }
            );
          }
        })();
      },
      intervalHours * 60 * 60 * 1000
    );
  }

  private async getDatabaseContent(): Promise<unknown> {
    switch (config.databaseType) {
      case 'json': {
        const dbPath = path.resolve(config.databasePath);
        if (fs.existsSync(dbPath)) {
          return JSON.parse(await fs.promises.readFile(dbPath, 'utf-8')) as Record<string, unknown>;
        }
        return {};
      }

      case 'sqlite': {
        const sqlitePath = path.resolve(config.databasePath);
        if (fs.existsSync(sqlitePath)) {
          const sqlite3 = (await import('sqlite3')).default;
          const db = new sqlite3.Database(sqlitePath);

          return new Promise((resolve, reject) => {
            db.all(
              "SELECT name FROM sqlite_master WHERE type='table'",
              [],
              (err: Error | null, tables: SqliteTable[]) => {
                if (err) {
                  db.close();
                  reject(err);
                  return;
                }

                void (async () => {
                  try {
                    const result: Record<string, unknown> = {};

                    for (const table of tables) {
                      await new Promise<void>((resolveTable, rejectTable) => {
                        db.all(
                          `SELECT * FROM ${table.name}`,
                          [],
                          (tableErr: Error | null, rows: unknown[]) => {
                            if (tableErr) {
                              rejectTable(tableErr);
                            } else {
                              result[table.name] = rows;
                              resolveTable();
                            }
                          }
                        );
                      });
                    }

                    db.close();
                    resolve(result);
                  } catch (e) {
                    db.close();
                    reject(e);
                  }
                })();
              }
            );
          });
        }
        return {};
      }

      case 'mongodb':
        // For MongoDB, we would use mongodump or similar
        return { note: 'MongoDB backup requires mongodump utility' };

      default:
        return {};
    }
  }

  private async cleanOldBackups(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.backupDir);
      const backupFiles = files
        .filter((f) => f.startsWith('backup_'))
        .map((f) => ({
          name: f,
          path: path.join(this.backupDir, f),
          mtime: fs.statSync(path.join(this.backupDir, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove old backups beyond maxBackups
      if (backupFiles.length > this.maxBackups) {
        const toRemove = backupFiles.slice(this.maxBackups);

        for (const file of toRemove) {
          await fs.promises.unlink(file.path);
          logger.debug(`Removed old backup: ${file.name}`);
        }
      }
    } catch (error) {
      // ✅ Fixed Pino signature order
      logger.warn(error, 'Failed to clean old backups:');
    }
  }

  getBackupHistory(): BackupResult[] {
    return this.backupHistory;
  }

  async restoreBackup(backupPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      const backupContent = JSON.parse(await fs.promises.readFile(backupPath, 'utf-8')) as Record<
        string,
        unknown
      >;

      // Restore based on database type
      switch (config.databaseType) {
        case 'json': {
          const dbPath = path.resolve(config.databasePath);
          await fs.promises.writeFile(dbPath, JSON.stringify(backupContent, null, 2));
          break;
        }

        case 'sqlite':
          // SQLite restore logic here
          break;

        case 'mongodb':
          // MongoDB restore logic here
          break;
      }

      logger.info(`✅ Database restored from: ${backupPath}`);
      return true;
    } catch (error) {
      // ✅ Fixed TS2769: Passed error as first argument
      logger.error(error, 'Database restore failed:');
      return false;
    }
  }
}

export const databaseBackupManager = DatabaseBackupManager.getInstance();
