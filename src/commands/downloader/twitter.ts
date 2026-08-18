// src/commands/downloader/twitter.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper, ValidationHelper } from '../../utils/helper';
import { http, fetchBuffer } from '../../utils/httpClient';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

interface TwitterMediaItem {
  buffer: Buffer;
  type: 'video' | 'image';
  size: number;
}

interface TwitterDownloadResult {
  items: TwitterMediaItem[];
  title: string;
  author?: string;
  isMultiPhoto: boolean;
}

interface YtDlpMeta {
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
}

interface TwitterScraperMedia {
  url?: string;
  download_url?: string;
  link?: string;
  type?: string;
}

interface TwitterScraperResponse {
  error?: boolean;
  medias?: TwitterScraperMedia[];
  data?: TwitterScraperMedia[] | TwitterScraperMedia;
  title?: string;
  text?: string;
  author?: string;
  username?: string;
}

const MAX_SIZE = (config.maxDownloadSize || 100) * 1024 * 1024;
const YTDLP_TIMEOUT = 120_000;
const QUALITY_LADDER = [720, 480, 360];

function isTwitterUrl(url: string): boolean {
  return /(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
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
  fallbackTitle: string
): Promise<{ title: string; author?: string }> {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      url,
      '--dump-json',
      '--no-warnings',
      '--no-playlist',
      '--no-cache-dir',
    ]);
    const info = JSON.parse(stdout) as YtDlpMeta;
    return {
      title: info.title || info.description?.slice(0, 100) || fallbackTitle,
      author: info.uploader || info.channel || undefined,
    };
  } catch {
    return { title: fallbackTitle };
  }
}

/**
 * Download video/GIF dari tweet via yt-dlp, target 720p dengan fallback turun.
 */
async function downloadVideoWithYtDlp(url: string): Promise<TwitterDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `twdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
      const { title, author } = await getMetaSafe(url, 'Twitter/X Video');
      await cleanupTempFiles(tmpDir, id);

      return {
        items: [{ buffer, type: 'video', size: buffer.length }],
        title,
        author,
        isMultiPhoto: false,
      };
    } catch (err: unknown) {
      const errorObj = err as { stderr?: string; message?: string };
      const stderr = errorObj.stderr || errorObj.message || 'yt-dlp gagal';
      lastError = new Error(stderr);
      await cleanupTempFiles(tmpDir, id);

      const isNotVideoTweet =
        stderr.includes('No video formats found') ||
        stderr.includes('There is no video') ||
        stderr.includes('no video in this');

      if (isNotVideoTweet) {
        throw lastError; // bukan soal kualitas, tweet ini foto — stop coba video
      }
    }
  }

  throw lastError || new Error('Gagal download video di semua level kualitas');
}

/**
 * Download foto tweet (tunggal atau multi-foto) via yt-dlp --write-thumbnail.
 */
async function downloadImageWithYtDlp(url: string): Promise<TwitterDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `twimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(tmpDir, `${id}-%(playlist_index,id)s.%(ext)s`);

  try {
    await execFileAsync(
      'yt-dlp',
      [
        url,
        '--skip-download',
        '--write-thumbnail',
        '--convert-thumbnails',
        'jpg',
        '--yes-playlist', // multi-foto tweet = "playlist" di yt-dlp
        '-o',
        outputTemplate,
        '--no-warnings',
        '--no-cache-dir',
      ],
      { timeout: YTDLP_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
    );

    const files = await fs.readdir(tmpDir);
    const imageFiles = files.filter((f) => f.startsWith(id) && /\.(jpg|jpeg|webp|png)$/i.test(f));

    if (imageFiles.length === 0) {
      throw new Error('yt-dlp tidak menghasilkan file gambar');
    }

    const items: TwitterMediaItem[] = [];

    for (const file of imageFiles.slice(0, 4)) {
      // Twitter maks 4 foto per tweet
      const filePath = path.join(tmpDir, file);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || stat.size > MAX_SIZE || stat.size < 512) {
        continue;
      }

      const buffer = await fs.readFile(filePath);
      items.push({ buffer, type: 'image', size: buffer.length });
    }

    if (items.length === 0) {
      throw new Error('Tidak ada gambar valid yang berhasil diunduh');
    }

    const { title, author } = await getMetaSafe(url, 'Twitter/X Photo');
    await cleanupTempFiles(tmpDir, id);

    return {
      items,
      title,
      author,
      isMultiPhoto: items.length > 1,
    };
  } catch (err: unknown) {
    await cleanupTempFiles(tmpDir, id);
    const errorObj = err as { stderr?: string; message?: string };
    throw new Error(errorObj.stderr || errorObj.message || 'yt-dlp gagal mengunduh gambar');
  }
}

/**
 * Fallback: scraper twdown.net (kalau endpoint masih hidup)
 */
async function downloadWithScraper(url: string): Promise<TwitterDownloadResult | null> {
  try {
    const apiUrl = config.twitterConfig['apiUrl'] as string;
    const timeout = (config.twitterConfig['timeout'] as number) || 20000;

    const response = await http.post<TwitterScraperResponse>(
      apiUrl,
      { url },
      {
        timeout,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const data = response.data;

    if (!data || data.error) {
      return null;
    }

    const rawMedias: TwitterScraperMedia[] =
      data.medias || (Array.isArray(data.data) ? data.data : data.data ? [data.data] : []);
    const validMedias = rawMedias.filter((m) => m?.url || m?.download_url || m?.link);
    if (validMedias.length === 0) {
      return null;
    }

    const items: TwitterMediaItem[] = [];

    for (const media of validMedias.slice(0, 4)) {
      const mediaUrl = media.url || media.download_url || media.link || '';
      const type: 'video' | 'image' =
        media.type === 'video' || /\.mp4($|\?)/.test(mediaUrl) ? 'video' : 'image';

      try {
        const buffer = await fetchBuffer(mediaUrl, { timeout, maxContentLength: MAX_SIZE });
        if (buffer.length < 512) {
          continue;
        }
        items.push({ buffer, type, size: buffer.length });
      } catch {
        continue;
      }
    }

    if (items.length === 0) {
      return null;
    }

    return {
      items,
      title: data.title || data.text || 'Twitter/X Media',
      author: data.author || data.username,
      isMultiPhoto: items.length > 1,
    };
  } catch (error) {
    logHelper.warn(
      'twitter-scraper',
      `Scraper failed: ${error instanceof Error ? error.message : 'Unknown'}`
    );
    return null;
  }
}

/**
 * Download Twitter/X: yt-dlp primary (video dulu, fallback foto),
 * scraper sebagai fallback terakhir kalau yt-dlp gagal total.
 */
async function downloadTwitter(url: string): Promise<TwitterDownloadResult> {
  try {
    return await downloadVideoWithYtDlp(url);
  } catch (videoErr: unknown) {
    const errorObj = videoErr as { message?: string };
    const message = errorObj?.message || '';
    const isNotVideoTweet =
      message.includes('No video formats found') ||
      message.includes('There is no video') ||
      message.includes('no video in this');

    if (isNotVideoTweet) {
      try {
        logHelper.info('twitter', 'Tweet ini foto, coba download sebagai gambar');
        return await downloadImageWithYtDlp(url);
      } catch (imageErr) {
        logHelper.warn(
          'twitter',
          `Download gambar gagal, coba scraper: ${(imageErr as Error).message}`
        );
      }
    } else {
      logHelper.warn('twitter', `yt-dlp gagal, coba scraper: ${message}`);
    }
  }

  const scraperResult = await downloadWithScraper(url);
  if (scraperResult) {
    logHelper.info('twitter', `Downloaded using scraper (${scraperResult.items.length} item(s))`);
    return scraperResult;
  }

  throw new Error('Semua metode download Twitter/X gagal');
}

/**
 * Command: Download Twitter/X (video, GIF, foto tunggal/multi)
 */
export const twitterCommand: Command = {
  name: 'twitter',
  aliases: ['tw', 'x', 'twdl', 'xdl'],
  category: 'downloader',
  description: 'Download video/foto Twitter (X)',
  usage: 'twitter <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Twitter/X!\n\n` +
          `*Contoh:*\n` +
          `${config.prefix}tw https://twitter.com/username/status/123456\n` +
          `${config.prefix}tw https://x.com/username/status/123456`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url) || !isTwitterUrl(url)) {
      await ctx.reply(
        '❌ URL Twitter/X tidak valid!\n\nPastikan link mengarah ke tweet (harus ada /status/).'
      );
      return;
    }

    await ctx.reply('🐦 Mendownload media Twitter/X...');

    try {
      logHelper.downloader('twitter', url, 'START');

      const result = await downloadTwitter(url);
      const totalSize = result.items.reduce((sum, item) => sum + item.size, 0);

      const captionParts = [
        `🐦 *Twitter/X Media*`,
        '',
        `📝 *Text:* ${StringHelper.formatFileSize(totalSize) ? result.title : result.title}`,
      ];

      if (result.author) {
        captionParts.push(`👤 *Author:* @${result.author}`);
      }
      if (result.isMultiPhoto) {
        captionParts.push(`🖼️ *Total foto:* ${result.items.length}`);
      }
      captionParts.push(`📦 *Size:* ${StringHelper.formatFileSize(totalSize)}`);

      const caption = captionParts.join('\n');

      logHelper.downloader(
        'twitter',
        url,
        'SUCCESS',
        `Items: ${result.items.length}, Size: ${totalSize}`
      );

      for (let i = 0; i < result.items.length; i++) {
        const item = result.items[i];
        await ctx.replyMedia(item!.buffer, item!.type, i === 0 ? caption : undefined);
      }
    } catch (error) {
      logHelper.downloader('twitter', url, 'FAILED');
      logHelper.error('twitter-command', error);

      await ctx.reply(
        '❌ Gagal mendownload media Twitter/X!\n\n' +
          '💡 *Tips:*\n' +
          '• Pastikan tweet tidak dari akun private\n' +
          '• Tweet mungkin sudah dihapus\n' +
          '• Tweet mungkin tidak berisi media\n' +
          '• Coba lagi dalam beberapa saat'
      );
    }
  },
};

export default {
  twitterCommand,
};
