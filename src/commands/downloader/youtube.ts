import { http, fetchBuffer } from '../../utils/httpClient';
import { isValidUrl, isYoutubeUrl } from '../../utils/mediaHelper';
import type { Command } from '../../types';

/**
 * Resolve link YouTube ke URL download langsung (mp3/mp4) via API
 * pihak ketiga. Ganti BASE_URL ini dengan penyedia API/self-hosted
 * yt-dlp service milikmu sendiri untuk penggunaan produksi yang stabil.
 */
const YT_API_BASE = 'https://api.some-ytdl-service.com'; // TODO: ganti dengan provider terpercaya/self-hosted

interface YtResolveResponse {
  status: boolean;
  title?: string;
  downloadUrl?: string;
  message?: string;
}

async function resolveYoutube(url: string, format: 'mp3' | 'mp4'): Promise<YtResolveResponse> {
  try {
    const res = await http.get<YtResolveResponse>(`${YT_API_BASE}/${format}`, {
      params: { url },
    });
    return res.data;
  } catch (err) {
    return { status: false, message: (err as Error).message };
  }
}

export const youtubeCommand: Command = {
  name: 'ytmp4',
  aliases: ['yt', 'ytv'],
  category: 'downloader',
  description: 'Download video YouTube (MP4)',
  usage: '.ytmp4 <url_youtube>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url) || !isYoutubeUrl(url)) {
      await ctx.reply('⚠️ Kirim link YouTube yang valid.\nContoh: .ytmp4 https://youtu.be/xxxxx');
      return;
    }

    await ctx.reply('⏳ Memproses video YouTube, mohon tunggu...');
    const result = await resolveYoutube(url, 'mp4');

    if (!result.status || !result.downloadUrl) {
      await ctx.reply(`❌ Gagal mengunduh video: ${result.message ?? 'video tidak ditemukan atau terlalu besar.'}`);
      return;
    }

    const buffer = await fetchBuffer(result.downloadUrl);
    await ctx.replyMedia(buffer, 'video', result.title);
  },
};

export const youtubeAudioCommand: Command = {
  name: 'ytmp3',
  aliases: ['yta'],
  category: 'downloader',
  description: 'Download audio YouTube (MP3)',
  usage: '.ytmp3 <url_youtube>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url) || !isYoutubeUrl(url)) {
      await ctx.reply('⚠️ Kirim link YouTube yang valid.\nContoh: .ytmp3 https://youtu.be/xxxxx');
      return;
    }

    await ctx.reply('⏳ Memproses audio YouTube, mohon tunggu...');
    const result = await resolveYoutube(url, 'mp3');

    if (!result.status || !result.downloadUrl) {
      await ctx.reply(`❌ Gagal mengunduh audio: ${result.message ?? 'video tidak ditemukan.'}`);
      return;
    }

    const buffer = await fetchBuffer(result.downloadUrl);
    await ctx.replyMedia(buffer, 'audio', result.title);
  },
};
