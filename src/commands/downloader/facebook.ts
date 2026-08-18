import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper, ValidationHelper } from '../../utils/helper';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

interface FacebookDownloadResult {
  buffer: Buffer;
  title: string;
  author?: string;
  duration?: string;
  quality?: string;
  thumbnail?: string;
  size: number;
  type: 'video' | 'image';
}

interface FdownData {
  hd?: string;
  sd?: string;
  url?: string;
  title?: string;
  author?: string;
  duration?: string;
  thumbnail?: string;
}

interface FdownApiResponse {
  success?: boolean;
  data?: FdownData;
}

interface YtDlpDumpJson {
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
}

const MAX_SIZE = ((config.maxDownloadSize as number | undefined) || 100) * 1024 * 1024;
const YTDLP_TIMEOUT = 120_000;
const QUALITY_LADDER = [720, 480, 360];

function detectFacebookType(url: string): 'video' | 'reel' | 'watch' | 'story' | 'post' {
  if (url.includes('/reel/')) {
    return 'reel';
  }
  if (url.includes('/watch/')) {
    return 'watch';
  }
  if (url.includes('/stories/')) {
    return 'story';
  }
  if (url.includes('/videos/')) {
    return 'video';
  }
  return 'post';
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
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

/**
 * Download menggunakan scraper 1: fdown.net (kalau endpoint ini masih hidup)
 */
async function downloadWithFdown(url: string): Promise<FacebookDownloadResult | null> {
  try {
    const apiUrl =
      (config.facebookConfig['apiUrl'] as string | undefined) || 'https://fdown.net/api';
    const timeout = (config.facebookConfig['timeout'] as number | undefined) || 20000;

    const response = await axios.post<FdownApiResponse>(
      apiUrl,
      { url },
      {
        timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    if (!data || !data.success) {
      return null;
    }

    const videoUrl = data.data?.hd || data.data?.sd || data.data?.url;
    if (!videoUrl) {
      return null;
    }

    const videoResponse = await axios.get<ArrayBuffer>(videoUrl, {
      responseType: 'arraybuffer',
      timeout,
      maxContentLength: MAX_SIZE,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    const buffer = Buffer.from(videoResponse.data);

    return {
      buffer,
      title: data.data?.title || 'Facebook Video',
      author: data.data?.author,
      duration: data.data?.duration ? formatDuration(parseInt(data.data.duration, 10)) : undefined,
      quality: data.data?.hd ? 'HD' : 'SD',
      thumbnail: data.data?.thumbnail,
      size: buffer.length,
      type: 'video',
    };
  } catch (error) {
    logHelper.warn(
      'facebook-fdown',
      `Fdown failed: ${error instanceof Error ? error.message : 'Unknown'}`
    );
    return null;
  }
}

/**
 * Fallback utama: yt-dlp, target tetap 720p dengan fallback turun kalau kebesaran.
 */
async function downloadWithYtDlp(url: string): Promise<FacebookDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `fbdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

      let title = 'Facebook Video';
      let author: string | undefined;
      let duration: string | undefined;
      try {
        const { stdout: infoOut } = await execFileAsync('yt-dlp', [
          url,
          '--dump-json',
          '--no-warnings',
          '--no-playlist',
          '--no-cache-dir',
        ]);
        const info = JSON.parse(infoOut) as YtDlpDumpJson;
        title = info.title || title;
        author = info.uploader || info.channel || undefined;
        duration = info.duration ? formatDuration(info.duration) : undefined;
      } catch {
        // pakai default kalau gagal ambil metadata
      }

      await cleanupTempFiles(tmpDir, id);

      return {
        buffer,
        title,
        author,
        duration,
        quality: `${height}p`,
        size: buffer.length,
        type: 'video',
      };
    } catch (err: unknown) {
      const errorObj = err as { stderr?: string; message?: string };
      lastError = new Error(errorObj.stderr || errorObj.message || 'yt-dlp gagal');
      await cleanupTempFiles(tmpDir, id);
    }
  }

  throw lastError || new Error('Gagal download di semua level kualitas');
}

/**
 * Download Facebook dengan fallback: scraper dulu, baru yt-dlp
 */
async function downloadFacebook(url: string): Promise<FacebookDownloadResult> {
  const fdownResult = await downloadWithFdown(url);
  if (fdownResult) {
    logHelper.info('facebook', 'Downloaded using fdown.net');
    return fdownResult;
  }

  logHelper.warn('facebook', 'Scraper gagal, fallback ke yt-dlp');
  return downloadWithYtDlp(url);
}

/**
 * Command: Download video Facebook
 */
export const facebookCommand: Command = {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'fbvideo'],
  category: 'downloader',
  description: 'Download video Facebook (Video, Reel, Watch, Story)',
  usage: 'facebook <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Facebook!\n\n` +
          `*Contoh:*\n` +
          `${config.prefix}facebook https://facebook.com/xxx/videos/123456\n` +
          `${config.prefix}facebook https://fb.watch/xxxxx\n` +
          `${config.prefix}facebook https://facebook.com/reel/123456`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url)) {
      await ctx.reply('❌ URL tidak valid!');
      return;
    }

    if (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com')) {
      await ctx.reply('❌ URL harus dari Facebook!');
      return;
    }

    const type = detectFacebookType(url);
    const typeEmoji =
      type === 'reel' ? '🎬' : type === 'watch' ? '📺' : type === 'story' ? '📖' : '📹';

    await ctx.reply(`${typeEmoji} Mendownload video Facebook...\n📌 Tipe: ${type}`);

    try {
      logHelper.downloader('facebook', url, 'START', `Type: ${type}`);

      const result = await downloadFacebook(url);

      const captionParts = [
        `${typeEmoji} *Facebook ${type === 'reel' ? 'Reel' : type === 'watch' ? 'Watch' : type === 'story' ? 'Story' : 'Video'}*`,
        '',
        `📝 *Title:* ${result.title}`,
      ];

      if (result.author) {
        captionParts.push(`👤 *Author:* ${result.author}`);
      }
      if (result.duration) {
        captionParts.push(`⏱️ *Duration:* ${result.duration}`);
      }
      if (result.quality) {
        captionParts.push(`🎯 *Quality:* ${result.quality}`);
      }
      captionParts.push(`📦 *Size:* ${StringHelper.formatFileSize(result.size)}`);

      const caption = captionParts.join('\n');

      logHelper.downloader('facebook', url, 'SUCCESS', `Size: ${result.size}`);

      await ctx.replyMedia(result.buffer, 'video', caption);
    } catch (error) {
      logHelper.downloader('facebook', url, 'FAILED');
      logHelper.error('facebook-command', error);

      await ctx.reply(
        '❌ Gagal mendownload video Facebook!\n\n' +
          '💡 *Tips:*\n' +
          '• Pastikan video tidak private\n' +
          '• Video mungkin dihapus\n' +
          '• Coba lagi dalam beberapa saat'
      );
    }
  },
};

/**
 * Command: Download Facebook Reel
 */
export const facebookReelCommand: Command = {
  name: 'fbreel',
  aliases: ['fbreels', 'facebookreel'],
  category: 'downloader',
  description: 'Download Facebook Reel',
  usage: 'fbreel <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Facebook Reel!\n\n` +
          `*Contoh:*\n` +
          `${config.prefix}fbreel https://facebook.com/reel/123456`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url)) {
      await ctx.reply('❌ URL tidak valid!');
      return;
    }

    if (!url.includes('/reel/')) {
      await ctx.reply('❌ URL harus dari Facebook Reel!\nGunakan .facebook untuk video biasa.');
      return;
    }

    await ctx.reply('🎬 Mendownload Facebook Reel...');

    try {
      logHelper.downloader('facebook', url, 'START', 'Reel');

      const result = await downloadFacebook(url);

      const caption =
        `🎬 *Facebook Reel*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        (result.author ? `👤 *Author:* ${result.author}\n` : '') +
        (result.duration ? `⏱️ *Duration:* ${result.duration}\n` : '') +
        `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

      logHelper.downloader('facebook', url, 'SUCCESS', `Reel size: ${result.size}`);

      await ctx.replyMedia(result.buffer, 'video', caption);
    } catch (error) {
      logHelper.downloader('facebook', url, 'FAILED');
      logHelper.error('facebook-reel-command', error);
      await ctx.reply('❌ Gagal mendownload Facebook Reel!');
    }
  },
};

/**
 * Command: Download Facebook HD
 */
export const facebookHdCommand: Command = {
  name: 'fbhd',
  aliases: ['facebookhd'],
  category: 'downloader',
  description: 'Download video Facebook HD',
  usage: 'fbhd <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL Facebook!\n\n` +
          `*Contoh:*\n` +
          `${config.prefix}fbhd https://facebook.com/xxx/videos/123456`
      );
      return;
    }

    if (!ValidationHelper.isUrl(url)) {
      await ctx.reply('❌ URL tidak valid!');
      return;
    }

    await ctx.reply('📹 Mendownload video Facebook HD...');

    try {
      logHelper.downloader('facebook', url, 'START', 'HD');

      const result = await downloadFacebook(url);

      const caption =
        `📹 *Facebook Video HD*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

      logHelper.downloader('facebook', url, 'SUCCESS', `HD size: ${result.size}`);

      await ctx.replyMedia(result.buffer, 'video', caption);
    } catch (error) {
      logHelper.downloader('facebook', url, 'FAILED');
      logHelper.error('facebook-hd-command', error);
      await ctx.reply('❌ Gagal mendownload video Facebook HD!');
    }
  },
};

export default {
  facebookCommand,
  facebookReelCommand,
  facebookHdCommand,
};
