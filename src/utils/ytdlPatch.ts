// src/utils/ytdlPatch.ts
import * as fs from 'fs';
import { logHelper } from './logger';

export async function withoutYtdlDebugFiles<T>(fn: () => Promise<T>): Promise<T> {
  const original = fs.writeFileSync;

  try {
    Object.defineProperty(fs, 'writeFileSync', {
      value: ((path: any, ...args: any[]) => {
        if (typeof path === 'string' && /player-script\.js$|watch\.html$/.test(path)) {
          return;
        }
        // Gunakan (original as Function) untuk membypass error 2556 (Spread argument)
        return (original as Function)(path, ...args);
      }) as typeof fs.writeFileSync,
      writable: true,
      configurable: true,
    });
  } catch (e) {
    // Kalau environment ini benar-benar tidak bisa dipatch (non-configurable),
    // lanjut saja tanpa suppress — jangan sampai ini yang menggagalkan download.
    logHelper.warn('ytdl-patch', `Tidak bisa patch fs.writeFileSync: ${e instanceof Error ? e.message : e}`);
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