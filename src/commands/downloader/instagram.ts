import { http, fetchBuffer } from '../../utils/httpClient';
import { isValidUrl, isInstagramUrl } from '../../utils/mediaHelper';
import type { Command } from '../../types';

interface IgMedia {
  url: string;
  type: 'image' | 'video';
}

/**
 * Resolve link Instagram (reel/post/video) menjadi daftar media.
 * Instagram post bisa berupa carousel (banyak media sekaligus),
 * karenanya return-nya berupa array.
 */
async function resolveInstagram(url: string): Promise<{ success: boolean; media: IgMedia[]; error?: string }> {
  try {
    // Endpoint contoh; ganti dengan provider IG-downloader terpercaya pilihanmu.
    const res = await http.get('https://api.some-ig-service.com/download', { params: { url } });
    const items = res.data?.data as Array<{ url: string; type: string }> | undefined;

    if (!items || items.length === 0) {
      return { success: false, media: [], error: 'Media tidak ditemukan, akun mungkin private.' };
    }

    const media: IgMedia[] = items.map((item) => ({
      url: item.url,
      type: item.type === 'video' ? 'video' : 'image',
    }));

    return { success: true, media };
  } catch (err) {
    return { success: false, media: [], error: (err as Error).message };
  }
}

export const instagramCommand: Command = {
  name: 'ig',
  aliases: ['instagram', 'igdl'],
  category: 'downloader',
  description: 'Download Reels/Post/Video Instagram',
  usage: '.ig <url_instagram>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url) || !isInstagramUrl(url)) {
      await ctx.reply('⚠️ Kirim link Instagram yang valid.\nContoh: .ig https://www.instagram.com/reel/xxxxx');
      return;
    }

    await ctx.reply('⏳ Memproses media Instagram...');
    const result = await resolveInstagram(url);

    if (!result.success || result.media.length === 0) {
      await ctx.reply(`❌ Gagal mengunduh: ${result.error ?? 'link tidak valid.'}`);
      return;
    }

    // Kirim setiap item media satu per satu (mendukung carousel)
    for (const item of result.media) {
      const buffer = await fetchBuffer(item.url);
      await ctx.replyMedia(buffer, item.type === 'video' ? 'video' : 'image');
    }
  },
};
