import { http, fetchBuffer } from '../../utils/httpClient';
import { isValidUrl, isFacebookUrl } from '../../utils/mediaHelper';
import type { Command } from '../../types';

/**
 * Resolve link video Facebook menjadi URL kualitas HD (fallback ke SD
 * jika HD tidak tersedia, umum terjadi pada video hasil live/reupload).
 */
async function resolveFacebook(url: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const res = await http.get('https://api.some-fb-service.com/download', { params: { url } });
    const hd = res.data?.hd as string | undefined;
    const sd = res.data?.sd as string | undefined;
    const videoUrl = hd ?? sd;

    if (!videoUrl) {
      return { success: false, error: 'Video tidak ditemukan atau bersifat privat.' };
    }
    return { success: true, url: videoUrl };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export const facebookCommand: Command = {
  name: 'fb',
  aliases: ['facebook', 'fbdl'],
  category: 'downloader',
  description: 'Download video Facebook',
  usage: '.fb <url_facebook>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url) || !isFacebookUrl(url)) {
      await ctx.reply('⚠️ Kirim link Facebook yang valid.\nContoh: .fb https://fb.watch/xxxxx');
      return;
    }

    await ctx.reply('⏳ Memproses video Facebook...');
    const result = await resolveFacebook(url);

    if (!result.success || !result.url) {
      await ctx.reply(`❌ Gagal mengunduh video: ${result.error ?? 'link tidak valid.'}`);
      return;
    }

    const buffer = await fetchBuffer(result.url);
    await ctx.replyMedia(buffer, 'video');
  },
};
