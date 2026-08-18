import { http, fetchBuffer } from '../../utils/httpClient';
import type { Command } from '../../types';

interface WaifuPicsResponse {
  url: string;
}

/**
 * Ambil wallpaper/gambar anime HD secara acak berdasarkan keyword
 * menggunakan waifu.pics (API publik, gratis, tanpa API key).
 * Kategori 'sfw' dipakai secara default untuk menjaga kontennya aman.
 */
async function getRandomWallpaper(category: string): Promise<string> {
  const res = await http.get<WaifuPicsResponse>(
    `https://api.waifu.im/images?IncludedTags=${category}`
  );
  return res.data.url;
}

const ALLOWED_CATEGORIES = ['waifu', 'neko', 'shinobu', 'megumin', 'landscape'] as const;

export const wallpaperCommand: Command = {
  name: 'wallpaper',
  aliases: ['wp', 'animewp'],
  category: 'anime',
  description: 'Kirim wallpaper anime HD acak',
  usage: `.wallpaper [kategori: ${ALLOWED_CATEGORIES.join('|')}]`,
  handler: async (ctx) => {
    const category = (ctx.args[0]?.toLowerCase() || 'waifu') as (typeof ALLOWED_CATEGORIES)[number];

    if (!ALLOWED_CATEGORIES.includes(category)) {
      await ctx.reply(
        `⚠️ Kategori tidak dikenal. Pilih salah satu: ${ALLOWED_CATEGORIES.join(', ')}`
      );
      return;
    }

    await ctx.reply('🖼️ Mengambil wallpaper...');

    try {
      const imageUrl = await getRandomWallpaper(category);
      const buffer = await fetchBuffer(imageUrl);
      await ctx.replyMedia(buffer, 'image', `Wallpaper: ${category}`);
    } catch (err) {
      await ctx.reply(`❌ Gagal mengambil wallpaper: ${(err as Error).message}`);
    }
  },
};
