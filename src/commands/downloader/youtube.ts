import { ytDlpPath } from '../../utils/yt-dlp';
// src/commands/downloader/youtube.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import { StringHelper } from '../../utils/helper';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

interface YouTubeVideoInfo {
  title: string;
  author: string;
  duration: string;
  thumbnail: string;
  views: string;
  likes: string;
  uploadDate: string;
  videoId: string;
}

interface YouTubeDownloadResult {
  buffer: Buffer;
  title: string;
  size: number;
}

interface YtDlpMeta {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  view_count?: number;
  like_count?: number;
  upload_date?: string;
}

interface SiputzxResponse {
  data?: {
    dl?: string;
    url?: string;
    download?: string;
    download_url?: string;
    title?: string;
  };
  result?: {
    dl?: string;
    url?: string;
    download?: string;
    download_url?: string;
    title?: string;
  };
  url?: string;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const REQUEST_TIMEOUT = 30_000;
const YTDLP_TIMEOUT = 120_000;

// Tangga kualitas: coba dari yang tertinggi, turun kalau hasil akhir kebesaran
const QUALITY_LADDER = [2160, 1440, 1080, 720, 480, 360];

function isValidYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url);
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

function extractDownloadUrl(data: SiputzxResponse): string | null {
  const candidates = [
    data.data?.dl,
    data.data?.url,
    data.data?.download,
    data.data?.download_url,
    data.result?.dl,
    data.result?.url,
    data.result?.download,
    data.url,
  ];
  return candidates.find((v): v is string => typeof v === 'string' && v.startsWith('http')) || null;
}

async function fetchBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_SIZE,
    maxBodyLength: MAX_SIZE,
    timeout: REQUEST_TIMEOUT,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const contentType = String(response.headers['content-type'] || '');
  const buffer = Buffer.from(response.data);

  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error(`Link download tidak valid (content-type: ${contentType})`);
  }
  if (buffer.length < 1024) {
    throw new Error('File hasil download terlalu kecil, kemungkinan gagal/rusak');
  }

  return { buffer, contentType };
}

/**
 * Hapus semua file sisa yt-dlp yang berawalan id tertentu di tmpDir
 * (.part, .info.json, thumbnail, dll) — mencegah sampah menumpuk di disk.
 */
async function cleanupTempFiles(tmpDir: string, id: string): Promise<void> {
  try {
    const files = await fs.readdir(tmpDir);
    const matches = files.filter((f) => f.includes(id));
    await Promise.all(matches.map((f) => fs.unlink(path.join(tmpDir, f)).catch(() => {})));
  } catch {
    // best-effort, jangan sampai gagal cleanup mengganggu flow utama
  }
}

/**
 * Download video pakai yt-dlp, coba kualitas tertinggi dulu lalu turun
 * bertahap kalau hasil akhirnya melebihi MAX_SIZE.
 */
async function downloadVideoWithYtDlp(url: string): Promise<YouTubeDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `ytdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastError: Error | null = null;

  for (const height of QUALITY_LADDER) {
    const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);
    const format = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

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
          '--extractor-args',
          'youtube:player_client=android,web',
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
        // Kebesaran, buang dan coba kualitas di bawahnya
        await cleanupTempFiles(tmpDir, id);
        lastError = new Error(`Hasil ${height}p melebihi batas ukuran, coba turunkan`);
        continue;
      }

      const buffer = await fs.readFile(filePath);
      const title = await getTitleSafe(url);
      await cleanupTempFiles(tmpDir, id);

      return { buffer, title, size: buffer.length };
    } catch (err: unknown) {
      const errorObj = err as { stderr?: string; message?: string };
      lastError = new Error(errorObj.stderr || errorObj.message || 'yt-dlp gagal');
      await cleanupTempFiles(tmpDir, id);
      // lanjut coba kualitas berikutnya
    }
  }

  throw lastError || new Error('Gagal download di semua level kualitas');
}

async function downloadAudioWithYtDlp(url: string): Promise<YouTubeDownloadResult> {
  const tmpDir = os.tmpdir();
  const id = `ytdlp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);

  try {
    const { stdout } = await execFileAsync(
      ytDlpPath,
      [
        url,
        '-f',
        'bestaudio',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0', // kualitas MP3 terbaik
        '-o',
        outputTemplate,
        '--no-playlist',
        '--no-warnings',
        '--no-cache-dir',
        '--extractor-args',
        'youtube:player_client=android,web',
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
      throw new Error('maxContentLength exceeded');
    }

    const buffer = await fs.readFile(filePath);
    const title = await getTitleSafe(url);
    await cleanupTempFiles(tmpDir, id);

    return { buffer, title, size: buffer.length };
  } catch (err: unknown) {
    await cleanupTempFiles(tmpDir, id);
    const errorObj = err as { stderr?: string; message?: string };
    throw new Error(errorObj.stderr || errorObj.message || 'yt-dlp gagal');
  }
}

async function getTitleSafe(url: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, [
      url,
      '--print',
      'title',
      '--no-warnings',
      '--no-playlist',
      '--no-cache-dir',
    ]);
    return stdout.trim() || 'YouTube Media';
  } catch {
    return 'YouTube Media';
  }
}

async function downloadYouTubeVideo(url: string): Promise<YouTubeDownloadResult> {
  try {
    const { data } = await axios.get<SiputzxResponse>(
      `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(url)}`,
      { timeout: REQUEST_TIMEOUT }
    );

    const downloadUrl = extractDownloadUrl(data);
    if (!downloadUrl) {
      throw new Error('Gagal mendapatkan link download dari API');
    }

    const { buffer } = await fetchBuffer(downloadUrl);

    return {
      buffer,
      title: data.data?.title || data.result?.title || 'YouTube Video',
      size: buffer.length,
    };
  } catch (apiError) {
    logHelper.warn(
      'youtube-api',
      `Video API failed, fallback ke yt-dlp: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
    );
  }

  return downloadVideoWithYtDlp(url);
}

async function downloadYouTubeAudio(url: string): Promise<YouTubeDownloadResult> {
  try {
    const { data } = await axios.get<SiputzxResponse>(
      `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(url)}`,
      { timeout: REQUEST_TIMEOUT }
    );

    const downloadUrl = extractDownloadUrl(data);
    if (!downloadUrl) {
      throw new Error('Gagal mendapatkan link download dari API');
    }

    const { buffer } = await fetchBuffer(downloadUrl);

    return {
      buffer,
      title: data.data?.title || data.result?.title || 'YouTube Audio',
      size: buffer.length,
    };
  } catch (apiError) {
    logHelper.warn(
      'youtube-api',
      `Audio API failed, fallback ke yt-dlp: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`
    );
  }

  return downloadAudioWithYtDlp(url);
}

async function getVideoInfo(url: string): Promise<YouTubeVideoInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      ytDlpPath,
      [url, '--dump-json', '--no-warnings', '--no-playlist', '--no-cache-dir'],
      { timeout: REQUEST_TIMEOUT, maxBuffer: 10 * 1024 * 1024 }
    );

    const info = JSON.parse(stdout) as YtDlpMeta;

    return {
      title: info.title || 'Unknown',
      author: info.uploader || info.channel || 'Unknown',
      duration: formatDuration(info.duration || 0),
      thumbnail: info.thumbnail || '',
      views: StringHelper.formatNumber(info.view_count || 0),
      likes: info.like_count !== undefined ? StringHelper.formatNumber(info.like_count) : 'Hidden',
      uploadDate: info.upload_date || 'Unknown',
      videoId: info.id || '',
    };
  } catch (error) {
    logHelper.warn('youtube-info', `${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

// ============================================
// COMMANDS
// ============================================

export const youtubeCommand: Command = {
  name: 'youtube',
  aliases: ['yt', 'ytv', 'ytmp4'],
  category: 'downloader',
  description: 'Download video YouTube (Video, Shorts, Music, Live)',
  usage: 'youtube <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url) {
      await ctx.reply(
        `❌ Masukkan URL YouTube!\n\n*Contoh:*\n${config.prefix}yt https://youtu.be/xxxxx`
      );
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      await ctx.reply('❌ URL YouTube tidak valid!');
      return;
    }

    await ctx.reply(`📹 Sedang mengunduh Video, mohon tunggu...`);

    try {
      const result = await downloadYouTubeVideo(url);

      const caption =
        `📹 *YouTube Video*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

      await ctx.replyMedia(result.buffer, 'video', caption);
    } catch (error: unknown) {
      const err = error as { message?: string };
      const message = err?.message || 'Unknown error';

      logHelper.warn('youtube-cmd', `Video download failed: ${message}`);
      if (message.includes('maxContentLength') || message.includes('exceeded')) {
        await ctx.reply(
          '❌ Gagal: Ukuran video terlalu besar untuk dikirim ke WhatsApp (>50MB) bahkan di kualitas terendah.'
        );
      } else {
        await ctx.reply('❌ Gagal mendownload video. Server sedang sibuk atau video dibatasi.');
      }
    }
  },
};

export const youtubeAudioCommand: Command = {
  name: 'youtubeaudio',
  aliases: ['yta', 'ytmp3', 'ytaudio'],
  category: 'downloader',
  description: 'Download audio/music YouTube (MP3)',
  usage: 'youtubeaudio <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url || !isValidYouTubeUrl(url)) {
      await ctx.reply(
        `❌ Masukkan URL YouTube yang valid!\n\nContoh: ${config.prefix}yta https://youtu.be/xxxxx`
      );
      return;
    }

    await ctx.reply(`🎵 Sedang mengunduh Audio, mohon tunggu...`);

    try {
      const result = await downloadYouTubeAudio(url);

      const caption =
        `🎵 *YouTube Audio*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

      await ctx.replyMedia(result.buffer, 'audio', caption);
    } catch (error: unknown) {
      const err = error as { message?: string };
      const message = err?.message || 'Unknown error';

      logHelper.warn('youtube-cmd', `Audio download failed: ${message}`);
      if (message.includes('maxContentLength') || message.includes('exceeded')) {
        await ctx.reply('❌ Gagal: Ukuran audio terlalu besar untuk dikirim ke WhatsApp (>50MB).');
      } else {
        await ctx.reply('❌ Gagal mendownload audio. Server sedang sibuk atau video dibatasi.');
      }
    }
  },
};

export const youtubeShortsCommand: Command = {
  name: 'ytshorts',
  aliases: ['shorts', 'ytshort'],
  category: 'downloader',
  description: 'Download YouTube Shorts',
  usage: 'ytshorts <url>',
  cooldown: 15,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url || !isValidYouTubeUrl(url) || (!url.includes('/shorts/') && !url.includes('shorts'))) {
      await ctx.reply(
        `❌ Masukkan URL YouTube Shorts yang valid!\n\nContoh: ${config.prefix}shorts https://youtube.com/shorts/xxxxx`
      );
      return;
    }

    await ctx.reply('📱 Sedang mengunduh Shorts, mohon tunggu...');

    try {
      const result = await downloadYouTubeVideo(url);

      const caption =
        `📱 *YouTube Shorts*\n\n` +
        `📝 *Title:* ${result.title}\n` +
        `📦 *Size:* ${StringHelper.formatFileSize(result.size)}`;

      await ctx.replyMedia(result.buffer, 'video', caption);
    } catch (error: unknown) {
      const err = error as { message?: string };
      const message = err?.message || 'Unknown error';

      logHelper.warn('youtube-cmd', `Shorts download failed: ${message}`);
      if (message.includes('maxContentLength') || message.includes('exceeded')) {
        await ctx.reply('❌ Gagal: Ukuran video Shorts terlalu besar untuk WhatsApp (>50MB).');
      } else {
        await ctx.reply('❌ Gagal mendownload Shorts.');
      }
    }
  },
};

export const youtubeInfoCommand: Command = {
  name: 'youtubeinfo',
  aliases: ['ytinfo', 'ytdetail'],
  category: 'downloader',
  description: 'Info detail video YouTube',
  usage: 'youtubeinfo <url>',
  cooldown: 10,

  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url || !isValidYouTubeUrl(url)) {
      await ctx.reply(`❌ Masukkan URL YouTube yang valid!`);
      return;
    }

    await ctx.reply('🔍 Mengambil info video...');

    try {
      const info = await getVideoInfo(url);

      if (!info) {
        await ctx.reply('❌ Gagal mengambil info video (Mungkin dibatasi oleh YouTube).');
        return;
      }

      const infoText =
        `📹 *YouTube Video Info*\n\n` +
        `📝 *Title:* ${info.title}\n` +
        `👤 *Channel:* ${info.author}\n` +
        `⏱️ *Duration:* ${info.duration}\n` +
        `👁️ *Views:* ${info.views}\n` +
        `👍 *Likes:* ${info.likes}\n` +
        `📅 *Uploaded:* ${info.uploadDate}\n` +
        `🔗 *ID:* ${info.videoId}`;

      await ctx.reply(infoText);
    } catch (error) {
      await ctx.reply('❌ Gagal mengambil info video.');
    }
  },
};

export default {
  youtubeCommand,
  youtubeAudioCommand,
  youtubeShortsCommand,
  youtubeInfoCommand,
};
