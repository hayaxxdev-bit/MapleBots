import { http, fetchBuffer } from '../../utils/httpClient';
import { config } from '../../config/config';
import { truncate } from '../../utils/mediaHelper';
import { CacheManager } from '../../utils/cache';
import {
  searchAnimeAniList,
  searchMangaAniList,
  getTopAnimeAniList,
  getSeasonNowAniList,
  searchCharacterAniList,
  getAnimeByStatusAniList,
} from '../../utils/anilistClient';
import type { Command, JikanTitleItemLike } from '../../types';

const cache = CacheManager.getInstance();
const CACHE_TTL_MEDIA = 60 * 60; // 1 jam — detail anime/manga jarang berubah
const CACHE_TTL_LIST = 30 * 60; // 30 menit — top/season list

interface JikanApiResponse<T> {
  data?: T;
}

interface JikanCharacterItem {
  name: string;
  name_kanji?: string | null;
  about?: string | null;
  images?: {
    jpg?: {
      image_url?: string;
    };
  };
  url: string;
  favorites?: number | null;
}

interface CharacterInfo {
  name: string;
  nameKanji?: string;
  about?: string;
  imageUrl?: string;
  url: string;
  favorites?: number | null;
}

interface AnimeListItem {
  title: string;
  score: number | null;
  type?: string | null;
  episodes?: number | null;
  genres: string[];
}

interface SeasonListItem {
  title: string;
  score: number | null;
  genres: string[];
}

function formatMembers(n?: number | null): string {
  if (!n) {
    return 'N/A';
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}jt`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}rb`;
  }
  return String(n);
}

function normalizeKey(prefix: string, query: string): string {
  return `${prefix}:${query.trim().toLowerCase()}`;
}

// ============================================
// Jikan fetchers
// ============================================

async function searchAnimeJikan(query: string): Promise<JikanTitleItemLike | null> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/anime`,
    {
      params: { q: query, limit: 1 },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data?.[0] ?? null;
}

async function searchMangaJikan(query: string): Promise<JikanTitleItemLike | null> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/manga`,
    {
      params: { q: query, limit: 1 },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data?.[0] ?? null;
}

async function getTopAnimeJikan(limit = 10): Promise<JikanTitleItemLike[]> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/top/anime`,
    {
      params: { limit },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data ?? [];
}

async function getSeasonNowJikan(limit = 10): Promise<JikanTitleItemLike[]> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/seasons/now`,
    {
      params: { limit },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data ?? [];
}

async function searchCharacterJikan(query: string): Promise<CharacterInfo | null> {
  const res = await http.get<JikanApiResponse<JikanCharacterItem[]>>(
    `${config.jikanBaseUrl}/characters`,
    {
      params: { q: query, limit: 1 },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanCharacterItem[]>;
  const item = responseData.data?.[0];
  if (!item) {
    return null;
  }
  return {
    name: item.name,
    nameKanji: item.name_kanji ?? undefined,
    about: item.about ?? 'Tidak ada deskripsi.',
    imageUrl: item.images?.jpg?.image_url,
    url: item.url,
    favorites: item.favorites,
  };
}

async function getOngoingAnimeJikan(limit = 10): Promise<JikanTitleItemLike[]> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/anime`,
    {
      params: { status: 'airing', order_by: 'popularity', sort: 'asc', limit },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data ?? [];
}

async function getCompleteAnimeJikan(limit = 10): Promise<JikanTitleItemLike[]> {
  const res = await http.get<JikanApiResponse<JikanTitleItemLike[]>>(
    `${config.jikanBaseUrl}/anime`,
    {
      params: { status: 'complete', order_by: 'popularity', sort: 'asc', limit },
    }
  );
  const responseData = res as unknown as JikanApiResponse<JikanTitleItemLike[]>;
  return responseData.data ?? [];
}

// ============================================
// Fallback wrapper: cache -> Jikan -> AniList
// ============================================

async function getAnimeWithFallback(query: string): Promise<JikanTitleItemLike | null> {
  const key = normalizeKey('anime', query);
  const cached = cache.get<JikanTitleItemLike>(key);
  if (cached) {
    return cached;
  }

  try {
    const result = await searchAnimeJikan(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // lanjut ke fallback
  }

  try {
    const result = await searchAnimeAniList(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // kedua sumber gagal
  }

  return null;
}

async function getMangaWithFallback(query: string): Promise<JikanTitleItemLike | null> {
  const key = normalizeKey('manga', query);
  const cached = cache.get<JikanTitleItemLike>(key);
  if (cached) {
    return cached;
  }

  try {
    const result = await searchMangaJikan(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // lanjut ke fallback
  }

  try {
    const result = await searchMangaAniList(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // keduanya gagal
  }

  return null;
}

async function getTopAnimeWithFallback(limit: number): Promise<AnimeListItem[]> {
  const key = normalizeKey('top-anime', String(limit));
  const cached = cache.get<AnimeListItem[]>(key);
  if (cached) {
    return cached;
  }

  try {
    const items = await getTopAnimeJikan(limit);
    if (items.length > 0) {
      const mapped: AnimeListItem[] = items.map((i) => ({
        title: i.title,
        score: i.score,
        type: i.type,
        episodes: i.episodes,
        genres: i.genres.map((g) => g.name),
      }));
      cache.set(key, mapped, CACHE_TTL_LIST);
      return mapped;
    }
  } catch {
    // fallback
  }

  const anilistResult = await getTopAnimeAniList(limit);
  cache.set(key, anilistResult, CACHE_TTL_LIST);
  return anilistResult;
}

async function getSeasonNowWithFallback(limit: number): Promise<SeasonListItem[]> {
  const key = normalizeKey('season-now', String(limit));
  const cached = cache.get<SeasonListItem[]>(key);
  if (cached) {
    return cached;
  }

  try {
    const items = await getSeasonNowJikan(limit);
    if (items.length > 0) {
      const mapped: SeasonListItem[] = items.map((i) => ({
        title: i.title,
        score: i.score,
        genres: i.genres.map((g) => g.name),
      }));
      cache.set(key, mapped, CACHE_TTL_LIST);
      return mapped;
    }
  } catch {
    // fallback
  }

  const anilistResult = await getSeasonNowAniList(limit);
  cache.set(key, anilistResult, CACHE_TTL_LIST);
  return anilistResult;
}

async function getCharacterWithFallback(query: string): Promise<CharacterInfo | null> {
  const key = normalizeKey('character', query);
  const cached = cache.get<CharacterInfo>(key);
  if (cached) {
    return cached;
  }

  try {
    const result = await searchCharacterJikan(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // fallback
  }

  try {
    const result = await searchCharacterAniList(query);
    if (result) {
      cache.set(key, result, CACHE_TTL_MEDIA);
      return result;
    }
  } catch {
    // keduanya gagal
  }

  return null;
}

// ============================================
// Caption formatters
// ============================================

function formatAnimeCaption(item: JikanTitleItemLike): string {
  const lines = [`📖 *${item.title}*`];

  if (item.title_english && item.title_english !== item.title) {
    lines.push(`🔤 ${item.title_english}`);
  }
  if (item.title_japanese) {
    lines.push(`🈺 ${item.title_japanese}`);
  }

  lines.push('');
  lines.push(
    `⭐ *Skor:* ${item.score ?? 'N/A'}${item.scored_by ? ` (${formatMembers(item.scored_by)} vote)` : ''}`
  );
  if (item.rank) {
    lines.push(`🏆 *Rank:* #${item.rank}`);
  }
  if (item.popularity) {
    lines.push(`🔥 *Popularity:* #${item.popularity}`);
  }
  if (item.members) {
    lines.push(`👥 *Members/Favorit:* ${formatMembers(item.members)}`);
  }

  lines.push(`🎞️ *Tipe:* ${item.type ?? 'N/A'}`);
  lines.push(
    `📺 *Episode:* ${item.episodes ?? 'N/A'}${item.duration ? ` (${item.duration})` : ''}`
  );
  lines.push(`📌 *Status:* ${item.status}`);

  if (item.aired?.string) {
    lines.push(`📅 *Tayang:* ${item.aired.string}`);
  }
  if (item.season && item.year) {
    lines.push(`🍂 *Musim:* ${item.season} ${item.year}`);
  }
  if (item.source) {
    lines.push(`📚 *Sumber:* ${item.source}`);
  }
  if (item.rating) {
    lines.push(`🔞 *Rating:* ${item.rating}`);
  }
  if (item.studios && item.studios.length > 0) {
    lines.push(`🏢 *Studio:* ${item.studios.map((s) => s.name).join(', ')}`);
  }

  lines.push(`🏷️ *Genre:* ${item.genres.map((g) => g.name).join(', ') || '-'}`);
  lines.push('');
  lines.push(`📝 ${truncate(item.synopsis ?? 'Sinopsis tidak tersedia.', 500)}`);

  if (item.trailer?.url) {
    lines.push('');
    lines.push(`🎬 *Trailer:* ${item.trailer.url}`);
  }

  lines.push('');
  lines.push(`🔗 ${item.url}`);

  return lines.join('\n');
}

function formatMangaCaption(item: JikanTitleItemLike): string {
  const lines = [`📖 *${item.title}* (Manga)`];

  if (item.title_english && item.title_english !== item.title) {
    lines.push(`🔤 ${item.title_english}`);
  }

  lines.push('');
  lines.push(
    `⭐ *Skor:* ${item.score ?? 'N/A'}${item.scored_by ? ` (${formatMembers(item.scored_by)} vote)` : ''}`
  );
  if (item.rank) {
    lines.push(`🏆 *Rank:* #${item.rank}`);
  }
  lines.push(`📕 *Chapter:* ${item.chapters ?? 'N/A'}`);
  lines.push(`📗 *Volume:* ${item.volumes ?? 'N/A'}`);
  lines.push(`📌 *Status:* ${item.status}`);
  if (item.published?.string) {
    lines.push(`📅 *Publikasi:* ${item.published.string}`);
  }
  if (item.authors && item.authors.length > 0) {
    lines.push(`✍️ *Author:* ${item.authors.map((a) => a.name).join(', ')}`);
  }
  lines.push(`🏷️ *Genre:* ${item.genres.map((g) => g.name).join(', ') || '-'}`);
  lines.push('');
  lines.push(`📝 ${truncate(item.synopsis ?? 'Sinopsis tidak tersedia.', 500)}`);
  lines.push('');
  lines.push(`🔗 ${item.url}`);

  return lines.join('\n');
}

function friendlyErrorMessage(err: unknown): string {
  const message = (err as Error)?.message ?? '';
  if (message.includes('504') || message.includes('503') || message.includes('ETIMEDOUT')) {
    return '❌ Server data anime sedang lambat/sibuk. Coba lagi dalam beberapa saat.';
  }
  return `❌ Terjadi kesalahan: ${message}`;
}

async function getOngoingWithFallback(limit: number): Promise<AnimeListItem[]> {
  const key = normalizeKey('ongoing-anime', String(limit));
  const cached = cache.get<AnimeListItem[]>(key);
  if (cached) {
    return cached;
  }

  try {
    const items = await getOngoingAnimeJikan(limit);
    if (items.length > 0) {
      const mapped: AnimeListItem[] = items.map((i) => ({
        title: i.title,
        score: i.score,
        type: i.type,
        episodes: i.episodes,
        genres: i.genres.map((g) => g.name),
      }));
      cache.set(key, mapped, CACHE_TTL_LIST);
      return mapped;
    }
  } catch {
    // fallback
  }

  const anilistResult = await getAnimeByStatusAniList('RELEASING', limit);
  cache.set(key, anilistResult, CACHE_TTL_LIST);
  return anilistResult;
}

async function getCompleteWithFallback(limit: number): Promise<AnimeListItem[]> {
  const key = normalizeKey('complete-anime', String(limit));
  const cached = cache.get<AnimeListItem[]>(key);
  if (cached) {
    return cached;
  }

  try {
    const items = await getCompleteAnimeJikan(limit);
    if (items.length > 0) {
      const mapped: AnimeListItem[] = items.map((i) => ({
        title: i.title,
        score: i.score,
        type: i.type,
        episodes: i.episodes,
        genres: i.genres.map((g) => g.name),
      }));
      cache.set(key, mapped, CACHE_TTL_LIST);
      return mapped;
    }
  } catch {
    // fallback
  }

  const anilistResult = await getAnimeByStatusAniList('FINISHED', limit);
  cache.set(key, anilistResult, CACHE_TTL_LIST);
  return anilistResult;
}

// ============================================
// COMMANDS
// ============================================

export const animeInfoCommand: Command = {
  name: 'anime',
  aliases: ['animeinfo'],
  category: 'anime',
  description: 'Cari info lengkap anime (skor, episode, studio, genre, trailer, dll)',
  usage: '.anime <judul>',
  cooldown: 5,
  handler: async (ctx) => {
    const query = ctx.fullText.trim();
    if (!query) {
      await ctx.reply('⚠️ Masukkan judul anime.\nContoh: .anime Jujutsu Kaisen');
      return;
    }

    await ctx.reply(`🔎 Mencari anime "${query}"...`);

    try {
      const item = await getAnimeWithFallback(query);
      if (!item) {
        await ctx.reply('❌ Anime tidak ditemukan. Coba judul lain.');
        return;
      }

      const caption = formatAnimeCaption(item);
      const imageBuffer = await fetchBuffer(
        item.images.jpg.large_image_url || item.images.jpg.image_url
      );
      await ctx.replyMedia(imageBuffer, 'image', caption);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const mangaInfoCommand: Command = {
  name: 'manga',
  aliases: ['mangainfo'],
  category: 'anime',
  description: 'Cari info lengkap manga (skor, chapter, volume, author, dll)',
  usage: '.manga <judul>',
  cooldown: 5,
  handler: async (ctx) => {
    const query = ctx.fullText.trim();
    if (!query) {
      await ctx.reply('⚠️ Masukkan judul manga.\nContoh: .manga One Piece');
      return;
    }

    await ctx.reply(`🔎 Mencari manga "${query}"...`);

    try {
      const item = await getMangaWithFallback(query);
      if (!item) {
        await ctx.reply('❌ Manga tidak ditemukan. Coba judul lain.');
        return;
      }

      const caption = formatMangaCaption(item);
      const imageBuffer = await fetchBuffer(
        item.images.jpg.large_image_url || item.images.jpg.image_url
      );
      await ctx.replyMedia(imageBuffer, 'image', caption);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const animeTopCommand: Command = {
  name: 'animetop',
  aliases: ['topanime'],
  category: 'anime',
  description: 'Lihat top 10 anime dengan skor tertinggi',
  usage: '.animetop',
  cooldown: 10,
  handler: async (ctx) => {
    await ctx.reply('🔎 Mengambil daftar top anime...');

    try {
      const items = await getTopAnimeWithFallback(10);
      if (items.length === 0) {
        await ctx.reply('❌ Gagal mengambil data top anime.');
        return;
      }

      const lines = items.map(
        (item, i) =>
          `${i + 1}. *${item.title}* — ⭐ ${item.score ?? 'N/A'}${item.type ? ` (${item.type}, ${item.episodes ?? '?'} eps)` : ''}`
      );

      await ctx.reply(`🏆 *Top 10 Anime*\n\n${lines.join('\n')}`);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const animeSeasonCommand: Command = {
  name: 'animeseason',
  aliases: ['animenow', 'seasonanime'],
  category: 'anime',
  description: 'Lihat anime yang sedang tayang musim ini',
  usage: '.animeseason',
  cooldown: 10,
  handler: async (ctx) => {
    await ctx.reply('🔎 Mengambil anime musim ini...');

    try {
      const items = await getSeasonNowWithFallback(10);
      if (items.length === 0) {
        await ctx.reply('❌ Gagal mengambil data anime musim ini.');
        return;
      }

      const lines = items.map(
        (item, i) =>
          `${i + 1}. *${item.title}* — ⭐ ${item.score ?? 'N/A'} (${item.genres.slice(0, 2).join(', ') || '-'})`
      );

      await ctx.reply(`🍂 *Anime Musim Ini*\n\n${lines.join('\n')}`);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const animeCharacterCommand: Command = {
  name: 'animechar',
  aliases: ['charanime', 'animecharacter'],
  category: 'anime',
  description: 'Cari info karakter anime by nama',
  usage: '.animechar <nama karakter>',
  cooldown: 5,
  handler: async (ctx) => {
    const query = ctx.fullText.trim();
    if (!query) {
      await ctx.reply('⚠️ Masukkan nama karakter.\nContoh: .animechar Gojo Satoru');
      return;
    }

    await ctx.reply(`🔎 Mencari karakter "${query}"...`);

    try {
      const char = await getCharacterWithFallback(query);
      if (!char) {
        await ctx.reply('❌ Karakter tidak ditemukan. Coba nama lain.');
        return;
      }

      const caption =
        `👤 *${char.name}*\n` +
        (char.nameKanji ? `🈺 ${char.nameKanji}\n` : '') +
        (char.favorites ? `❤️ *Favorit:* ${formatMembers(char.favorites)}\n` : '') +
        `\n📝 ${truncate(char.about ?? 'no descriptions')}\n\n` +
        `🔗 ${char.url}`;

      const imageBuffer = char.imageUrl ? await fetchBuffer(char.imageUrl) : undefined;
      if (imageBuffer) {
        await ctx.replyMedia(imageBuffer, 'image', caption);
      } else {
        await ctx.reply(caption);
      }
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const animeOngoingCommand: Command = {
  name: 'animeongoing',
  aliases: ['ongoinganime', 'animeairing'],
  category: 'anime',
  description: 'Lihat daftar anime yang sedang tayang (ongoing)',
  usage: '.animeongoing',
  cooldown: 10,
  handler: async (ctx) => {
    await ctx.reply('🔎 Mengambil daftar anime ongoing...');

    try {
      const items = await getOngoingWithFallback(10);
      if (items.length === 0) {
        await ctx.reply('❌ Gagal mengambil data anime ongoing.');
        return;
      }

      const lines = items.map(
        (item, i) =>
          `${i + 1}. *${item.title}* — ⭐ ${item.score ?? 'N/A'}${item.type ? ` (${item.type}, ${item.episodes ?? '?'} eps)` : ''}`
      );

      await ctx.reply(`📡 *Anime Ongoing*\n\n${lines.join('\n')}`);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export const animeCompleteCommand: Command = {
  name: 'animecomplete',
  aliases: ['completeanime', 'animefinished'],
  category: 'anime',
  description: 'Lihat daftar anime yang sudah tamat (complete)',
  usage: '.animecomplete',
  cooldown: 10,
  handler: async (ctx) => {
    await ctx.reply('🔎 Mengambil daftar anime complete...');

    try {
      const items = await getCompleteWithFallback(10);
      if (items.length === 0) {
        await ctx.reply('❌ Gagal mengambil data anime complete.');
        return;
      }

      const lines = items.map(
        (item, i) =>
          `${i + 1}. *${item.title}* — ⭐ ${item.score ?? 'N/A'}${item.type ? ` (${item.type}, ${item.episodes ?? '?'} eps)` : ''}`
      );

      await ctx.reply(`✅ *Anime Complete*\n\n${lines.join('\n')}`);
    } catch (err) {
      await ctx.reply(friendlyErrorMessage(err));
    }
  },
};

export default {
  animeInfoCommand,
  mangaInfoCommand,
  animeTopCommand,
  animeSeasonCommand,
  animeCharacterCommand,
  animeOngoingCommand,
  animeCompleteCommand,
};
