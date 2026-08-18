// src/infrastructure/storage/ytdl-patch.ts
import * as fs from 'node:fs';
import { logHelper } from '../logging/logger';

export async function withoutYtdlDebugFiles<T>(fn: () => Promise<T>): Promise<T> {
  const original = fs.writeFileSync;

  try {
    Object.defineProperty(fs, 'writeFileSync', {
      value: ((...args: Parameters<typeof fs.writeFileSync>) => {
        const path = args[0];
        if (typeof path === 'string' && /player-script\.js$|watch\.html$/.test(path)) {
          return;
        }

        // Gunakan .apply untuk meneruskan semua overload arguments dengan aman
        return Reflect.apply(original, fs, args);
      }) as typeof fs.writeFileSync,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logHelper.warn('ytdl-patch', `Tidak bisa patch fs.writeFileSync: ${errorMessage}`);
    return fn();
  }

  try {
    return await fn();
  } finally {
    Object.defineProperty(fs, 'writeFileSync', {
      value: original,
      writable: true,
      configurable: true,
    });
  }
}
