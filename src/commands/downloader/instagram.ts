// src/commands/downloader/instagram.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper, ValidationHelper } from '../../utils/helper';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { galleryDlPath } from '../../utils/gallery-dl';

const execFileAsync = promisify(execFile);

interface InstagramMediaItem {
  buffer: Buffer;
  type: 'video' | 'image';
  size: number;
}

interface InstagramDownloadResult {
  items: InstagramMediaItem[];
  title: string;
  author?: string;
  isCarousel: boolean;
}

interface YtDlpDumpJson {
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
}

const MAX_SIZE = ((config.maxDownloadSize as number | undefined) || 100) * 1024 * 1024;
const YTDLP_TIMEOUT = 120_000;
const QUALITY_LADDER = [720, 480, 360];
const COOKIES_PATH = (config.instagramConfig['cookiesPath'] as string) || '';

function detectInstagramType(url: string): 'reel' | 'post' | 'story' | 'igtv' | 'tv' {
  if (url.includes('/reel/')) {
    return 'reel';
  }
  if (url.includes('/stories/')) {
    return 'story';
  }
  if (url.includes('/tv/')) {
    return 'igtv';
  }
  return 'post';
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|reels|stories|tv)\//.test(url) || url.includes('instagr.am');
}

/** Tambahkan flag --cookies kalau file cookies dikonfigurasi & ada di disk */
async function cookieArgs(): Promise<string[]> {
  if (!COOKIES_PATH) {
    return [];
  }
  try {
    await fs.access(COOKIES_PATH);
    return ['--cookies', COOKIES_PATH];
  } catch {
    logHelper.warn(
      'instagram-ytdlp',
      `INSTAGRAM_COOKIES_PATH diset tapi file tidak ditemukan: ${COOKIES_PATH}`
    );
    return [];
  }
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

async function getMetaSafe(
  url: string,
  fallbackTitle: string,
  extraArgs: string[]
): Promise<{ title: string; author?: string }> {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--no-cache-dir',
      ...extraArgs,
    ]);
    const info = JSON.parse(stdout) as YtDlpDumpJson;
    return {
      title: info.title || info.description?.slice(0, 80) || fallbackTitle,
      author: info.uploader || info.channel || undefined,
    };
  } catch {
    return { title: fallbackTitle };
  }
}

/**
 * Download video Instagram (Reel/IGTV/video post) via yt-dlp.
 */
async function downloadVideoWithYtDlp(url: string): Promise<InstagramDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `igdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cookies = await cookieArgs();

  let lastError: Error | null = null;

  for (const height of QUALITY_LADDER) {
    const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);
    const format = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        [
          url,
          '-f',
          format,
          '--merge-output-format',
          'mp4',
          '-o',
          outputTemplate,
          '--no-playlist',
          '--no-warnings',
          '--no-cache-dir',
          '--print',
          'after_move:filepath',
          ...cookies,
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
        lastError = new Error(`Hasil ${height}p melebihi batas ukuran, coba turunkan`);
        continue;
      }

      const buffer = await fs.readFile(filePath);
      const { title, author } = await getMetaSafe(url, 'Instagram Video', cookies);
      await cleanupTempFiles(tmpDir, id);

      return {
        items: [{ buffer, type: 'video', size: buffer.length }],
        title,
        author,
        isCarousel: false,
      };
    } catch (err: unknown) {
      const errorObj = err as { stderr?: string; message?: string };
      const stderr = errorObj.stderr || errorObj.message || 'yt-dlp gagal';
      lastError = new Error(stderr);
      await cleanupTempFiles(tmpDir, id);

      if (stderr.includes('no video in this post') || stderr.includes('There is no video')) {
        throw lastError; // bukan soal kualitas, ini memang bukan video — stop coba video
      }
    }
  }

  throw lastError || new Error('Gagal download video di semua level kualitas');
}

/**
 * Download foto (tunggal atau carousel) Instagram via gallery-dl.
 * Dukungan foto gallery-dl jauh lebih matang dibanding yt-dlp.
 */
async function downloadImageWithYtDlp(url: string): Promise<InstagramDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `iggdl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const destDir = path.join(tmpDir, id);
  await fs.mkdir(destDir, { recursive: true });

  const cookies = COOKIES_PATH ? ['--cookies', COOKIES_PATH] : [];

  try {
    await execFileAsync(galleryDlPath, [url, '-D', destDir, '--no-mtime', ...cookies], {
      timeout: YTDLP_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });

    const files = await fs.readdir(destDir);
    const mediaFiles = files.filter((f) => /\.(jpg|jpeg|webp|png|mp4)$/i.test(f));

    if (mediaFiles.length === 0) {
      throw new Error('gallery-dl tidak menghasilkan file media (kemungkinan butuh cookies login)');
    }

    const items: InstagramMediaItem[] = [];

    for (const file of mediaFiles.slice(0, 10)) {
      const filePath = path.join(destDir, file);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || stat.size > MAX_SIZE || stat.size < 512) {
        continue;
      }

      const buffer = await fs.readFile(filePath);
      const type: 'video' | 'image' = /\.mp4$/i.test(file) ? 'video' : 'image';
      items.push({ buffer, type, size: buffer.length });
    }

    if (items.length === 0) {
      throw new Error('Tidak ada media valid yang berhasil diunduh');
    }

    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});

    return {
      items,
      title: 'Instagram Photo',
      author: undefined,
      isCarousel: items.length > 1,
    };
  } catch (err: unknown) {
    const errorObj = err as { stderr?: string; message?: string };
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(errorObj.stderr || errorObj.message || 'gallery-dl gagal mengunduh gambar');
  }
}

/**
 * Coba video dulu; kalau ternyata post ini foto/carousel, coba sebagai gambar.
 */
async function downloadInstagram(url: string): Promise<InstagramDownloadResult> {
  try {
    return await downloadVideoWithYtDlp(url);
  } catch (err: unknown) {
    const errorObj = err as { message?: string };
    const message = errorObj.message || '';
    const isNotVideoPost =
      message.includes('no video in this post') ||
      message.includes('There is no video') ||
      message.includes('No video formats found');

    if (isNotVideoPost) {
      logHelper.info('instagram', 'Post ini foto/carousel, coba download sebagai gambar');
      return downloadImageWithYtDlp(url);
    }
    throw err;
  }
}

/**
 * Command: Download Instagram (post/reel/igtv, mendukung carousel)
 */
export const instagramCommand: Command = {
  name: 'instagram',
  aliases: ['ig', 'igdl', 'igdownload'],
  category: 'downloader',
  description: 'Download foto/video Instagram (Post, Reel, IGTV, Carousel)',
  usage: 'instagram <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Instagram!\n\n` +
          `*Contoh:*\n` +
          `${config.prefix}ig https://instagram.com/p/xxxxx\n` +
          `${config.prefix}ig https://instagram.com/reel/xxxxx`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url) || !isInstagramUrl(url)) {
      await ctx.reply(
        '❌ URL Instagram tidak valid!\n\nPastikan link dari post/reel/igtv Instagram.'
      );
      return;
    }

    const type = detectInstagramType(url);
    const typeEmoji =
      type === 'reel' ? '🎬' : type === 'story' ? '📖' : type === 'igtv' ? '📺' : '📷';

    await ctx.reply(`${typeEmoji} Mendownload media Instagram...\n📌 Tipe: ${type}`);

    try {
      logHelper.downloader('instagram', url, 'START', `Type: ${type}`);

      const result = await downloadInstagram(url);
      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const captionParts = [
        `${typeEmoji} *Instagram ${type === 'reel' ? 'Reel' : type === 'igtv' ? 'IGTV' : type === 'story' ? 'Story' : 'Post'}*`,
        '',
        `📝 *Title:* ${result.title}`,
      ];

      if (result.author) {
        captionParts.push(`👤 *Author:* ${result.author}`);
      }
      if (result.isCarousel) {
        captionParts.push(`🖼️ *Total item:* ${result.items.length}`);
      }
      captionParts.push(`📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`);

      const caption = captionParts.join('\n');

      logHelper.downloader(
        'instagram',
        url,
        'SUCCESS',
        `Items: ${result.items.length}, Size: ${totalSize}`
      );

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        await ctx.replyMedia(item!.buffer, item!.type, i === 0 ? caption : undefined);
      }
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');
      logHelper.error('instagram-command', error);

      const message = (error as Error)?.message || '';
      const needsLogin =
        message.includes('login') || message.includes('cookies') || message.includes('rate-limit');

      await ctx.reply(
        '❌ Gagal mendownload media Instagram!\n\n' +
          '💡 *Tips:*\n' +
          '• Pastikan akun/post tidak private\n' +
          '• Post mungkin dihapus\n' +
          (needsLogin ? '• Konten ini butuh login untuk diakses (hubungi admin bot)\n' : '') +
          '• Coba lagi dalam beberapa saat'
      );
    }
  },
};

/**
 * Command: Download Instagram Reel khusus
 */
export const instagramReelCommand: Command = {
  name: 'igreel',
  aliases: ['reelig', 'instareel'],
  category: 'downloader',
  description: 'Download Instagram Reel',
  usage: 'igreel <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Instagram Reel!\n\n` +
          `*Contoh:*\n${config.prefix}igreel https://instagram.com/reel/xxxxx`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url) || !url.includes('/reel')) {
      await ctx.reply('❌ URL harus dari Instagram Reel!\nGunakan .instagram untuk post biasa.');
      return;
    }

    await ctx.reply('🎬 Mendownload Instagram Reel...');

    try {
      logHelper.downloader('instagram', url, 'START', 'Reel');

      const result = await downloadVideoWithYtDlp(url);
      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const caption =
        `🎬 *Instagram Reel*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        (result.author ? `👤 *Author:* ${result.author}\n` : '') +
        `📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`;

      logHelper.downloader('instagram', url, 'SUCCESS', `Size: ${totalSize}`);

      await ctx.replyMedia(result.items[0]!.buffer, result.items[0]!.type, caption);
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');
      logHelper.error('instagram-reel-command', error);
      await ctx.reply('❌ Gagal mendownload Instagram Reel!');
    }
  },
};

/**
 * Command: Download Instagram Story
 */
export const instagramStoryCommand: Command = {
  name: 'igstory',
  aliases: ['storyig', 'instastory'],
  category: 'downloader',
  description: 'Download Instagram Story (butuh cookies login)',
  usage: 'igstory <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Instagram Story!\n\n` +
          `*Contoh:*\n${config.prefix}igstory https://instagram.com/stories/username/xxxxx`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url) || !url.includes('/stories/')) {
      await ctx.reply('❌ URL harus dari Instagram Story!');
      return;
    }

    if (!COOKIES_PATH) {
      await ctx.reply(
        '❌ Fitur download Story belum dikonfigurasi (butuh cookies login Instagram di sisi server).'
      );
      return;
    }

    await ctx.reply('📖 Mendownload Instagram Story...');

    try {
      logHelper.downloader('instagram', url, 'START', 'Story');

      const result = await downloadImageWithYtDlp(url).catch(() => downloadVideoWithYtDlp(url));
      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const caption =
        `📖 *Instagram Story*\n\n` +
        (result.author ? `👤 *Author:* ${result.author}\n` : '') +
        `📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`;

      logHelper.downloader('instagram', url, 'SUCCESS', `Size: ${totalSize}`);

      await ctx.replyMedia(result.items[0]!.buffer, result.items[0]!.type, caption);
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');
      logHelper.error('instagram-story-command', error);
      await ctx.reply(
        '❌ Gagal mendownload Instagram Story!\n\n' +
          '💡 Story hanya bisa diunduh selama masih aktif (< 24 jam), akun tidak private, dan cookies login masih valid.'
      );
    }
  },
};

export default {
  instagramCommand,
  instagramReelCommand,
  instagramStoryCommand,
};
