// src/commands/downloader/pinterest.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper, ValidationHelper } from '../../utils/helper';
import { fetchBuffer } from '../../utils/httpClient';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { WASocket, WAMessage } from '@whiskeysockets/baileys';

const execFileAsync = promisify(execFile);

interface PinterestResult {
  buffer: Buffer;
  type: 'video' | 'image';
  title: string;
  size: number;
}

const MAX_SIZE = ((config.maxDownloadSize as number | undefined) || 100) * 1024 * 1024;
const GALLERY_DL_TIMEOUT = 60_000;
const YTDLP_TIMEOUT = 60_000;
const REQUEST_TIMEOUT = 15_000;
const REPLY_WAIT_TIMEOUT = 60_000;
const PINTEREST_BASE = 'https://id.pinterest.com';

function isPinterestUrl(url: string): boolean {
  return /(pinterest\.[a-z.]+\/pin\/|pin\.it\/)/.test(url);
}

function buildSearchUrl(query: string): string {
  return `${PINTEREST_BASE}/search/pins/?q=${encodeURIComponent(query)}`;
}

async function cleanupTempFiles(tmpDir: string, id: string): Promise<void> {
  try {
    const files = await fs.readdir(tmpDir);
    const matches = files.filter((f) => f.includes(id));
    await Promise.all(matches.map((f) => fs.unlink(path.join(tmpDir, f)).catch(() => {})));
  } catch {
    // best-effort
  }
}

// ============================================
// Wait-for-reply mechanism
// ============================================

async function askAndWaitReply(
  sock: WASocket,
  chatId: string,
  sender: string,
  promptText: string,
  timeoutMs: number = REPLY_WAIT_TIMEOUT
): Promise<string | null> {
  const sentMsg = await sock.sendMessage(chatId, { text: promptText });
  const promptId = sentMsg?.key?.id;

  if (!promptId) {
    logHelper.warn(
      'pinterest-reply',
      'Gagal dapat message id dari prompt, tidak bisa tracking reply'
    );
    return null;
  }

  const isGroup = chatId.endsWith('@g.us');

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      sock.ev.off('messages.upsert', onUpsert);
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(null);
    }, timeoutMs);

    const onUpsert = (update: { messages: WAMessage[]; type: string }) => {
      if (resolved) {
        return;
      }

      for (const msg of update.messages) {
        if (!msg.message) {
          continue;
        }
        if (msg.key.remoteJid !== chatId) {
          continue;
        }
        if (msg.key.fromMe) {
          continue;
        }
        if (isGroup && msg.key.participant !== sender) {
          continue;
        }

        const extText = msg.message.extendedTextMessage;
        const quotedStanzaId = extText?.contextInfo?.stanzaId;
        if (quotedStanzaId !== promptId) {
          continue;
        }

        const replyText = extText?.text || msg.message.conversation || '';
        if (!replyText.trim()) {
          continue;
        }

        resolved = true;
        cleanup();
        resolve(replyText.trim());
        return;
      }
    };

    sock.ev.on('messages.upsert', onUpsert);
  });
}

// ============================================
// gallery-dl based fetch
// ============================================

/**
 * Ambil media locator. Jika isSearch true, ambil dari 15 teratas dan pilih acak.
 * Jika URL pin langsung, ambil 1 saja.
 */
async function getMediaLocator(
  url: string,
  isSearch: boolean
): Promise<{ url: string; isVideo: boolean } | null> {
  try {
    const range = isSearch ? '1-15' : '1-1';
    const { stdout } = await execFileAsync('gallery-dl', [url, '-g', '--range', range], {
      timeout: GALLERY_DL_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024,
    });

    const lines = stdout.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    // Jika pencarian, pilih index acak dari hasil yang didapat
    const randomIndex = isSearch ? Math.floor(Math.random() * lines.length) : 0;
    const selectedLine = lines[randomIndex];

    if (!selectedLine) {
      return null;
    }

    if (selectedLine.startsWith('ytdl:')) {
      return { url: selectedLine.slice('ytdl:'.length), isVideo: true };
    }

    return { url: selectedLine, isVideo: false };
  } catch (err: unknown) {
    const errorObj = err as { stderr?: string; message?: string };
    logHelper.warn(
      'pinterest-gallerydl',
      `gallery-dl gagal: ${errorObj.stderr || errorObj.message || 'unknown'}`
    );
    return null;
  }
}

async function getTitleSafe(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gallery-dl', [url, '--dump-json', '--range', '1-1'], {
      timeout: GALLERY_DL_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024,
    });

    const titleMatch = stdout.match(/"(?:title|grid_title|description)"\s*:\s*"([^"]{3,120})"/);
    if (titleMatch?.[1]) {
      return titleMatch[1].replace(/\\u002F/g, '/').replace(/\\"/g, '"');
    }
  } catch {
    // biarkan default
  }
  return 'Pinterest Pin';
}

async function downloadVideoFromM3u8(m3u8Url: string): Promise<{ buffer: Buffer; size: number }> {
  const tmpDir = os.tmpdir();
  const id = `pinvid-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);

  try {
    const { stdout } = await execFileAsync(
      'yt-dlp',
      [
        m3u8Url,
        '-f',
        'bestvideo[height<=1080]+bestaudio/best',
        '--merge-output-format',
        'mp4',
        '-o',
        outputTemplate,
        '--no-warnings',
        '--no-cache-dir',
        '--print',
        'after_move:filepath',
      ],
      { timeout: YTDLP_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
    );

    const filePath = stdout.trim().split('\n').filter(Boolean).pop();
    if (!filePath) {
      throw new Error('yt-dlp tidak menghasilkan file output');
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) {
      throw new Error('File hasil yt-dlp tidak ditemukan');
    }
    if (stat.size > MAX_SIZE) {
      await cleanupTempFiles(tmpDir, id);
      throw new Error('Ukuran video melebihi batas maksimal');
    }

    const buffer = await fs.readFile(filePath);
    await cleanupTempFiles(tmpDir, id);

    return { buffer, size: buffer.length };
  } catch (err: unknown) {
    const errorObj = err as { stderr?: string; message?: string };
    await cleanupTempFiles(tmpDir, id);
    throw new Error(errorObj.stderr || errorObj.message || 'yt-dlp gagal mengunduh video');
  }
}

/**
 * Download Pinterest: Jika isSearch true, maka ambil title dari query parameter
 * karena kita mengambil random pin dari hasil pencarian.
 */
async function downloadPinterest(url: string, isSearch: boolean): Promise<PinterestResult> {
  const media = await getMediaLocator(url, isSearch);

  if (!media) {
    throw new Error('Tidak menemukan media di URL/pencarian ini');
  }

  let title = 'Pinterest Pin';
  if (isSearch) {
    const queryMatch = url.match(/[?&]q=([^&]+)/);
    if (queryMatch && queryMatch[1]) {
      title = `Pencarian: ${decodeURIComponent(queryMatch[1])}`;
    } else {
      title = 'Hasil Pencarian Pinterest';
    }
  } else {
    title = await getTitleSafe(url);
  }

  if (media.isVideo) {
    const { buffer, size } = await downloadVideoFromM3u8(media.url);
    return { buffer, type: 'video', title, size };
  }

  const buffer = await fetchBuffer(media.url, {
    timeout: REQUEST_TIMEOUT,
    maxContentLength: MAX_SIZE,
  });
  if (buffer.length < 512) {
    throw new Error('File gambar hasil download tidak valid');
  }

  return { buffer, type: 'image', title, size: buffer.length };
}

// ============================================
// Shared handler
// ============================================

async function processPinAndReply(
  ctx: Parameters<Command['handler']>[0],
  targetUrl: string,
  isSearch: boolean
): Promise<void> {
  try {
    logHelper.downloader('pinterest', targetUrl, 'START');

    const result = await downloadPinterest(targetUrl, isSearch);
    const typeEmoji = result.type === 'video' ? '🎬' : '📷';

    const caption =
      `${typeEmoji} *Pinterest ${result.type === 'video' ? 'Video' : 'Pin'}*\n\n` +
      `📝 *Title:* ${result.title}\n` +
      `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

    logHelper.downloader(
      'pinterest',
      targetUrl,
      'SUCCESS',
      `Type: ${result.type}, Size: ${result.size}`
    );

    await ctx.replyMedia(result.buffer, result.type, caption);
  } catch (error) {
    logHelper.downloader('pinterest', targetUrl, 'FAILED');
    logHelper.error('pinterest-command', error);

    await ctx.reply(
      '❌ Gagal mendownload dari Pinterest!\n\n' +
        '💡 *Tips:*\n' +
        '• Pastikan link/keyword valid\n' +
        '• Pin mungkin sudah dihapus atau privat\n' +
        '• Coba lagi dalam beberapa saat'
    );
  }
}

// ============================================
// Command
// ============================================

export const pinterestCommand: Command = {
  name: 'pinterest',
  aliases: ['pin', 'p', 'pindl', 'pinterestdl'],
  category: 'downloader',
  description: 'Download foto/video/GIF Pinterest dari link pin, atau cari berdasarkan keyword',
  usage: '.p <url atau keyword>',
  cooldown: 10,

  handler: async (ctx) => {
    const input = ctx.fullText.trim();

    // Kasus 1: tanpa argumen -> minta reply keyword
    if (!input) {
      const query = await askAndWaitReply(
        ctx.sock,
        ctx.chatId,
        ctx.sender,
        '📌 Balas pesan ini dengan judul/keyword yang mau dicari di Pinterest.\n\n_Contoh: naruto_'
      );

      if (!query) {
        await ctx.reply('⏱️ Waktu habis, tidak ada balasan. Coba lagi dengan `.p <keyword>`.');
        return;
      }

      await ctx.reply(`🔎 Mencari dan memilih hasil acak untuk "${query}" di Pinterest...`);
      await processPinAndReply(ctx, buildSearchUrl(query), true);
      return;
    }

    // Kasus 2: URL pin langsung
    if (ValidationHelper.isUrl(input) && isPinterestUrl(input)) {
      await ctx.reply('📌 Mendownload dari Pinterest...');
      await processPinAndReply(ctx, input, false);
      return;
    }

    // Kasus 3: keyword langsung tanpa reply
    await ctx.reply(`🔎 Mencari dan memilih hasil acak untuk "${input}" di Pinterest...`);
    await processPinAndReply(ctx, buildSearchUrl(input), true);
  },
};

export default {
  pinterestCommand,
};
