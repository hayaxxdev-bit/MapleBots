// src/infrastructure/storage/temp-file-manager.ts
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logging/logger';
import { metrics } from '../metrics/metrics';
import { appEvents, AppEvent } from '../../app/events';

interface CleanupResult {
  filesCleaned: number;
  spaceFreed: number;
  duration: number;
}

export class TempFileManager {
  private isCleaning = false;

  async cleanup(tempDir: string, maxAgeMinutes: number): Promise<CleanupResult> {
    if (this.isCleaning) {
      logger.warn('Cleanup already in progress, skipping...');
      return { filesCleaned: 0, spaceFreed: 0, duration: 0 };
    }

    this.isCleaning = true;
    const startTime = Date.now();
    let filesCleaned = 0;
    let spaceFreed = 0;

    try {
      const resolvedTempDir = path.resolve(tempDir);

      // Create directory if it doesn't exist
      if (!fs.existsSync(resolvedTempDir)) {
        fs.mkdirSync(resolvedTempDir, { recursive: true });
        logger.debug(`Created temp directory: ${resolvedTempDir}`);
        return { filesCleaned: 0, spaceFreed: 0, duration: Date.now() - startTime };
      }

      const files = await fs.promises.readdir(resolvedTempDir);
      const now = Date.now();
      const maxAgeMs = maxAgeMinutes * 60 * 1000;

      const deletePromises = files.map(async (file) => {
        const filePath = path.join(resolvedTempDir, file);

        try {
          const stats = await fs.promises.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > maxAgeMs) {
            await fs.promises.unlink(filePath);
            filesCleaned++;
            spaceFreed += stats.size;

            logger.debug(`Deleted temp file: ${file} (age: ${Math.round(age / 60000)} minutes)`);
          }
        } catch (error) {
          logger.warn(error as Error, `Failed to process temp file ${file}:`);
        }
      });

      await Promise.all(deletePromises);

      const duration = Date.now() - startTime;
      const spaceFreedMB = (spaceFreed / 1024 / 1024).toFixed(2);

      if (filesCleaned > 0) {
        logger.info(`🧹 Cleaned ${filesCleaned} temp files (${spaceFreedMB} MB) in ${duration}ms`);

        // Record metrics
        metrics.record('temp_files_cleaned', filesCleaned);
        metrics.record('temp_space_freed', spaceFreed);
        metrics.record('temp_cleanup_duration', duration);

        // Emit event
        appEvents.emit(AppEvent.TEMP_CLEANUP_COMPLETE, {
          filesCleaned,
          spaceFreed,
          duration,
        });
      }

      return { filesCleaned, spaceFreed, duration };
    } catch (error) {
      logger.error(error as Error, 'Temp cleanup failed:');
      throw error;
    } finally {
      this.isCleaning = false;
    }
  }

  scheduleCleanup(tempDir: string, maxAgeMinutes: number, intervalMinutes: number): NodeJS.Timeout {
    logger.info(`📅 Scheduling temp cleanup every ${intervalMinutes} minutes`);

    return setInterval(
      () => {
        void (async () => {
          try {
            await this.cleanup(tempDir, maxAgeMinutes);
          } catch (error) {
            logger.error(error as Error, 'Scheduled cleanup failed:');
          }
        })();
      },
      intervalMinutes * 60 * 1000
    );
  }
}

export const tempFileManager = new TempFileManager();
