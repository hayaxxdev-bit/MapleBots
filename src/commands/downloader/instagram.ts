import { ytDlpPath } from '../../utils/yt-dlp';
// src/commands/downloader/instagram.ts

import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper, ValidationHelper } from '../../utils/helper';
import { galleryDlPath } from '../../utils/gallery-dl';

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

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

const MAX_CAROUSEL_ITEMS = 10;

/**
 * Deteksi tipe URL Instagram.
 */
function detectInstagramType(url: string): 'reel' | 'post' | 'story' | 'igtv' | 'tv' {
  if (url.includes('/reel/') || url.includes('/reels/')) {
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

/**
 * Validasi URL Instagram.
 */
function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|reels|stories|tv)\//.test(url) || url.includes('instagr.am');
}

/**
 * Resolve cookie Instagram.
 *
 * Cookies hanya digunakan untuk operasi yang memang membutuhkan
 * autentikasi Instagram:
 *
 * - gallery-dl untuk foto/carousel
 * - Instagram Story
 *
 * Video/Reel via yt-dlp tidak menggunakan cookies.
 */
async function getInstagramCookieArgs(): Promise<string[]> {
  if (!COOKIES_PATH) {
    return [];
  }

  try {
    await fs.access(COOKIES_PATH);

    return ['--cookies', COOKIES_PATH];
  } catch {
    logHelper.warn(
      'instagram-cookies',
      `INSTAGRAM_COOKIES_PATH diset tapi file tidak ditemukan: ${COOKIES_PATH}`
    );

    return [];
  }
}

/**
 * Pastikan cookies tersedia.
 *
 * Dipakai ketika operasi memang membutuhkan login.
 */
async function requireInstagramCookies(): Promise<string[]> {
  const cookies = await getInstagramCookieArgs();

  if (cookies.length === 0) {
    throw new Error('Instagram cookies diperlukan untuk mengunduh foto/carousel/story');
  }

  return cookies;
}

/**
 * Hapus file temporary berdasarkan ID.
 */
async function cleanupTempFiles(tmpDir: string, id: string): Promise<void> {
  try {
    const files = await fs.readdir(tmpDir);

    const matches = files.filter((file) => file.includes(id));

    await Promise.all(matches.map((file) => fs.unlink(path.join(tmpDir, file)).catch(() => {})));
  } catch {
    // best-effort cleanup
  }
}

/**
 * Ambil metadata Instagram menggunakan yt-dlp.
 *
 * Tidak digunakan untuk menentukan kebutuhan cookies.
 * Caller yang menentukan apakah cookies boleh diteruskan.
 */
async function getMetaSafe(
  url: string,
  fallbackTitle: string,
  extraArgs: string[] = []
): Promise<{ title: string; author?: string }> {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, [
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
    return {
      title: fallbackTitle,
    };
  }
}

/**
 * Download video Instagram.
 *
 * Digunakan untuk:
 * - Reel
 * - video post
 * - IGTV
 *
 * PENTING:
 * Jalur ini TIDAK menggunakan Instagram cookies.
 */
async function downloadVideoWithYtDlp(url: string): Promise<InstagramDownloadResult> {
  const tmpDir = os.tmpdir();

  const id = `igdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastError: Error | null = null;

  for (const height of QUALITY_LADDER) {
    const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);

    const format = `bestvideo[height<=${height}]+bestaudio/` + `best[height<=${height}]/best`;

    try {
      const { stdout } = await execFileAsync(
        ytDlpPath,
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
        ],
        {
          timeout: YTDLP_TIMEOUT,
          maxBuffer: 10 * 1024 * 1024,
        }
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

        lastError = new Error(`Hasil ${height}p melebihi batas ukuran`);

        continue;
      }

      const buffer = await fs.readFile(filePath);

      /*
       * Metadata video tidak membutuhkan cookies.
       */
      const { title, author } = await getMetaSafe(url, 'Instagram Video');

      await cleanupTempFiles(tmpDir, id);

      return {
        items: [
          {
            buffer,
            type: 'video',
            size: buffer.length,
          },
        ],
        title,
        author,
        isCarousel: false,
      };
    } catch (err: unknown) {
      const errorObj = err as {
        stderr?: string;
        message?: string;
      };

      const stderr = errorObj.stderr || errorObj.message || 'yt-dlp gagal';

      lastError = new Error(stderr);

      await cleanupTempFiles(tmpDir, id);

      /*
       * Kalau jelas bukan video, jangan mencoba
       * kualitas berikutnya.
       */
      if (
        stderr.includes('no video in this post') ||
        stderr.includes('There is no video') ||
        stderr.includes('No video formats found')
      ) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Gagal download video di semua level kualitas');
}

/**
 * Download foto Instagram menggunakan gallery-dl.
 *
 * Digunakan untuk:
 * - single photo post
 * - carousel
 * - story
 *
 * Cookies WAJIB digunakan karena kebutuhan autentikasi
 * Instagram untuk jenis media ini.
 */
async function downloadImagesWithGalleryDl(url: string): Promise<InstagramDownloadResult> {
  const tmpDir = os.tmpdir();

  const id = `iggdl-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const destDir = path.join(tmpDir, id);

  await fs.mkdir(destDir, {
    recursive: true,
  });

  try {
    /*
     * Gallery-dl membutuhkan cookies untuk jalur ini.
     */
    const cookies = await requireInstagramCookies();

    await execFileAsync(galleryDlPath, [url, '-D', destDir, '--no-mtime', ...cookies], {
      timeout: YTDLP_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });

    const files = await fs.readdir(destDir);

    const mediaFiles = files.filter((file) => /\.(jpg|jpeg|webp|png|mp4)$/i.test(file));

    if (mediaFiles.length === 0) {
      throw new Error('gallery-dl tidak menghasilkan file media');
    }

    const items: InstagramMediaItem[] = [];

    /*
     * Batasi jumlah item carousel supaya tidak membebani
     * WhatsApp maupun memory process.
     */
    for (const file of mediaFiles.slice(0, MAX_CAROUSEL_ITEMS)) {
      const filePath = path.join(destDir, file);

      const stat = await fs.stat(filePath).catch(() => null);

      if (!stat) {
        continue;
      }

      if (stat.size > MAX_SIZE) {
        logHelper.warn('instagram-gallerydl', `Media dilewati karena terlalu besar: ${file}`);

        continue;
      }

      if (stat.size < 512) {
        continue;
      }

      const buffer = await fs.readFile(filePath);

      const type: 'video' | 'image' = /\.mp4$/i.test(file) ? 'video' : 'image';

      items.push({
        buffer,
        type,
        size: buffer.length,
      });
    }

    if (items.length === 0) {
      throw new Error('Tidak ada media Instagram valid yang berhasil diunduh');
    }

    /*
     * Metadata foto/carousel tidak dipaksa menggunakan
     * yt-dlp karena jalur utama media adalah gallery-dl.
     */
    await fs.rm(destDir, {
      recursive: true,
      force: true,
    });

    return {
      items,
      title: 'Instagram Photo',
      author: undefined,
      isCarousel: items.length > 1,
    };
  } catch (err: unknown) {
    const errorObj = err as {
      stderr?: string;
      message?: string;
    };

    await fs
      .rm(destDir, {
        recursive: true,
        force: true,
      })
      .catch(() => {});

    throw new Error(
      errorObj.stderr || errorObj.message || 'gallery-dl gagal mengunduh media Instagram'
    );
  }
}

/**
 * Download Instagram berdasarkan tipe media.
 *
 * Strategy:
 *
 * Reel / video
 *     -> yt-dlp tanpa cookies
 *
 * Post foto / carousel
 *     -> gallery-dl dengan cookies
 *
 * Story
 *     -> gallery-dl dengan cookies
 */
async function downloadInstagram(url: string): Promise<InstagramDownloadResult> {
  const type = detectInstagramType(url);

  /*
   * Story langsung menggunakan gallery-dl.
   */
  if (type === 'story') {
    return downloadImagesWithGalleryDl(url);
  }

  /*
   * Reel / IGTV:
   * video downloader tanpa cookies.
   */
  if (type === 'reel' || type === 'igtv' || type === 'tv') {
    return downloadVideoWithYtDlp(url);
  }

  /*
   * Post biasa:
   *
   * Jangan menggunakan yt-dlp sebagai probe terlebih dahulu.
   * Gunakan gallery-dl supaya:
   *
   * - single photo bekerja
   * - carousel bekerja
   * - cookies selalu tersedia
   * - tidak terjadi fallback ambigu antara video/foto
   *
   * Untuk video post yang bukan Reel, kita coba yt-dlp
   * tanpa cookies terlebih dahulu.
   */
  try {
    return await downloadVideoWithYtDlp(url);
  } catch (err: unknown) {
    const errorObj = err as {
      message?: string;
    };

    const message = errorObj.message || '';

    const isNotVideo =
      message.includes('no video in this post') ||
      message.includes('There is no video') ||
      message.includes('No video formats found') ||
      message.includes('requested format is not available');

    if (!isNotVideo) {
      /*
       * Untuk error video yang bukan "bukan video",
       * jangan menyembunyikan error asli.
       */
      throw err;
    }

    logHelper.info('instagram', 'Post bukan video, menggunakan gallery-dl untuk foto/carousel');

    return downloadImagesWithGalleryDl(url);
  }
}

/**
 * Command: Download Instagram.
 *
 * Mendukung:
 * - Post
 * - Reel
 * - IGTV
 * - Carousel
 * - Story
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
        '❌ URL Instagram tidak valid!\n\n' + 'Pastikan link dari post/reel/igtv Instagram.'
      );

      return;
    }

    const type = detectInstagramType(url);

    const typeEmoji =
      type === 'reel'
        ? '🎬'
        : type === 'story'
          ? '📖'
          : type === 'igtv' || type === 'tv'
            ? '📺'
            : '📷';

    await ctx.reply(`${typeEmoji} Mendownload media Instagram...\n` + `📌 Tipe: ${type}`);

    try {
      logHelper.downloader('instagram', url, 'START', `Type: ${type}`);

      const result = await downloadInstagram(url);

      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const captionParts = [
        `${typeEmoji} *Instagram ${
          type === 'reel'
            ? 'Reel'
            : type === 'igtv' || type === 'tv'
              ? 'IGTV'
              : type === 'story'
                ? 'Story'
                : 'Post'
        }*`,
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

        if (!item) {
          continue;
        }

        await ctx.replyMedia(item.buffer, item.type, i === 0 ? caption : undefined);
      }
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');

      logHelper.error('instagram-command', error);

      const message = (error as Error)?.message || '';

      const needsLogin =
        message.includes('login') ||
        message.includes('cookies') ||
        message.includes('rate-limit') ||
        message.includes('authentication');

      await ctx.reply(
        '❌ Gagal mendownload media Instagram!\n\n' +
          '💡 *Tips:*\n' +
          '• Pastikan akun/post tidak private\n' +
          '• Post mungkin sudah dihapus\n' +
          (needsLogin ? '• Konten ini membutuhkan login/cookies Instagram yang valid\n' : '') +
          '• Coba lagi dalam beberapa saat'
      );
    }
  },
};

/**
 * Command: Download Instagram Reel khusus.
 *
 * Reel menggunakan yt-dlp dan TIDAK menggunakan cookies.
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
          `*Contoh:*\n` +
          `${config.prefix}igreel https://instagram.com/reel/xxxxx`
      );

      return;
    }

    if (!ValidationHelper.isUrl(url) || !url.includes('/reel')) {
      await ctx.reply(
        '❌ URL harus dari Instagram Reel!\n' + 'Gunakan .instagram untuk post biasa.'
      );

      return;
    }

    await ctx.reply('🎬 Mendownload Instagram Reel...');

    try {
      logHelper.downloader('instagram', url, 'START', 'Reel');

      /*
       * Tidak ada cookies di sini.
       */
      const result = await downloadVideoWithYtDlp(url);

      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const caption =
        `🎬 *Instagram Reel*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        (result.author ? `👤 *Author:* ${result.author}\n` : '') +
        `📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`;

      logHelper.downloader('instagram', url, 'SUCCESS', `Size: ${totalSize}`);

      const item = result.items[0];

      if (!item) {
        throw new Error('Instagram Reel tidak menghasilkan media');
      }

      await ctx.replyMedia(item.buffer, item.type, caption);
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');

      logHelper.error('instagram-reel-command', error);

      await ctx.reply('❌ Gagal mendownload Instagram Reel!');
    }
  },
};

/**
 * Command: Download Instagram Story.
 *
 * Story membutuhkan cookies login.
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
          `*Contoh:*\n` +
          `${config.prefix}igstory https://instagram.com/stories/username/xxxxx`
      );

      return;
    }

    if (!ValidationHelper.isUrl(url) || !url.includes('/stories/')) {
      await ctx.reply('❌ URL harus dari Instagram Story!');

      return;
    }

    if (!COOKIES_PATH) {
      await ctx.reply(
        '❌ Fitur download Story belum dikonfigurasi ' +
          '(butuh cookies login Instagram di sisi server).'
      );

      return;
    }

    /*
     * Validasi cookie sebelum memulai download.
     */
    try {
      await requireInstagramCookies();
    } catch {
      await ctx.reply('❌ Instagram cookies tidak ditemukan atau tidak valid di server.');

      return;
    }

    await ctx.reply('📖 Mendownload Instagram Story...');

    try {
      logHelper.downloader('instagram', url, 'START', 'Story');

      const result = await downloadImagesWithGalleryDl(url);

      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const caption =
        `📖 *Instagram Story*\n\n` +
        (result.author ? `👤 *Author:* ${result.author}\n` : '') +
        `📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`;

      logHelper.downloader(
        'instagram',
        url,
        'SUCCESS',
        `Items: ${result.items.length}, Size: ${totalSize}`
      );

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];

        if (!item) {
          continue;
        }

        await ctx.replyMedia(item.buffer, item.type, i === 0 ? caption : undefined);
      }
    } catch (error) {
      logHelper.downloader('instagram', url, 'FAILED');

      logHelper.error('instagram-story-command', error);

      await ctx.reply(
        '❌ Gagal mendownload Instagram Story!\n\n' +
          '💡 Story hanya bisa diunduh selama masih aktif, ' +
          'akun dapat diakses, dan cookies login masih valid.'
      );
    }
  },
};

export default {
  instagramCommand,
  instagramReelCommand,
  instagramStoryCommand,
};
