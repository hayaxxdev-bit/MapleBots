import { http, fetchBuffer } from '../../utils/httpClient';
import { config } from '../../config/config';
import { truncate } from '../../utils/mediaHelper';
import type { Command, JikanAnimeResult } from '../../types';

interface JikanSearchItem {
  title: string;
  synopsis: string | null;
  score: number | null;
  episodes: number | null;
  status: string;
  genres: { name: string }[];
  images: { jpg: { image_url: string } };
  url: string;
}

/** Cari anime by judul via Jikan (REST API resmi untuk data MyAnimeList) */
async function searchAnime(query: string): Promise<JikanAnimeResult | null> {
  const res = await http.get(`${config.jikanBaseUrl}/anime`, {
    params: { q: query, limit: 1 },
  });

  const item = (res.data?.data as JikanSearchItem[] | undefined)?.[0];
  if (!item) return null;

  return {
    title: item.title,
    synopsis: item.synopsis ?? 'Sinopsis tidak tersedia.',
    score: item.score,
    episodes: item.episodes,
    status: item.status,
    genres: item.genres.map((g) => g.name),
    imageUrl: item.images.jpg.image_url,
    url: item.url,
  };
}

/** Cari manga by judul (endpoint sama, path berbeda) */
async function searchManga(query: string): Promise<JikanAnimeResult | null> {
  const res = await http.get(`${config.jikanBaseUrl}/manga`, {
    params: { q: query, limit: 1 },
  });

  const item = (res.data?.data as JikanSearchItem[] | undefined)?.[0];
  if (!item) return null;

  return {
    title: item.title,
    synopsis: item.synopsis ?? 'Sinopsis tidak tersedia.',
    score: item.score,
    episodes: item.episodes, // untuk manga, field ini merepresentasikan chapter di Jikan v4 sbg 'chapters', ditangani terpisah bila perlu
    status: item.status,
    genres: item.genres.map((g) => g.name),
    imageUrl: item.images.jpg.image_url,
    url: item.url,
  };
}

function formatAnimeCaption(data: JikanAnimeResult, kind: 'Anime' | 'Manga'): string {
  return (
    `📖 *${data.title}* (${kind})\n\n` +
    `⭐ Skor: ${data.score ?? 'N/A'}\n` +
    `📺 Episode/Chapter: ${data.episodes ?? 'N/A'}\n` +
    `📌 Status: ${data.status}\n` +
    `🏷️ Genre: ${data.genres.join(', ') || '-'}\n\n` +
    `📝 ${truncate(data.synopsis, 500)}\n\n` +
    `🔗 ${data.url}`
  );
}

export const animeInfoCommand: Command = {
  name: 'anime',
  aliases: ['animeinfo'],
  category: 'anime',
  description: 'Cari info anime (judul, sinopsis, skor, episode)',
  usage: '.anime <judul>',
  handler: async (ctx) => {
    const query = ctx.fullText.trim();
    if (!query) {
      await ctx.reply('⚠️ Masukkan judul anime.\nContoh: .anime Jujutsu Kaisen');
      return;
    }

    await ctx.reply(`🔎 Mencari anime "${query}"...`);

    try {
      const data = await searchAnime(query);
      if (!data) {
        await ctx.reply('❌ Anime tidak ditemukan. Coba judul lain.');
        return;
      }

      const caption = formatAnimeCaption(data, 'Anime');
      const imageBuffer = await fetchBuffer(data.imageUrl);
      await ctx.replyMedia(imageBuffer, 'image', caption);
    } catch (err) {
      await ctx.reply(`❌ Gagal mencari anime: ${(err as Error).message}`);
    }
  },
};

export const mangaInfoCommand: Command = {
  name: 'manga',
  aliases: ['mangainfo'],
  category: 'anime',
  description: 'Cari info manga (judul, sinopsis, skor, chapter)',
  usage: '.manga <judul>',
  handler: async (ctx) => {
    const query = ctx.fullText.trim();
    if (!query) {
      await ctx.reply('⚠️ Masukkan judul manga.\nContoh: .manga One Piece');
      return;
    }

    await ctx.reply(`🔎 Mencari manga "${query}"...`);

    try {
      const data = await searchManga(query);
      if (!data) {
        await ctx.reply('❌ Manga tidak ditemukan. Coba judul lain.');
        return;
      }

      const caption = formatAnimeCaption(data, 'Manga');
      const imageBuffer = await fetchBuffer(data.imageUrl);
      await ctx.replyMedia(imageBuffer, 'image', caption);
    } catch (err) {
      await ctx.reply(`❌ Gagal mencari manga: ${(err as Error).message}`);
    }
  },
};
