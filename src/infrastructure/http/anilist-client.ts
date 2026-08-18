// src/utils/anilistClient.ts
import axios from 'axios';
import type { JikanTitleItemLike } from '../../types';

const ANILIST_URL = 'https://graphql.anilist.co';
const ANILIST_TIMEOUT = 15000;

//#region Interfaces / Types
interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

interface AniListFuzzyDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

interface AniListRanking {
  rank: number;
  type: string;
  context: string;
}

interface AniListStudioNode {
  name: string;
}

interface AniListMedia {
  id: number;
  title?: AniListTitle | null;
  description?: string | null;
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: number | null;
  status?: string | null;
  format?: string | null;
  source?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: AniListFuzzyDate | null;
  genres?: string[] | null;
  studios?: { nodes?: AniListStudioNode[] | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  siteUrl: string;
  trailer?: { id?: string | null; site?: string | null } | null;
  rankings?: AniListRanking[] | null;
}

interface AniListCharacter {
  name?: { full?: string | null; native?: string | null } | null;
  description?: string | null;
  favourites?: number | null;
  image?: { large?: string | null } | null;
  siteUrl: string;
}

interface AniListError {
  message: string;
}

interface AniListGraphQLResponse<T> {
  data?: T;
  errors?: AniListError[];
}
//#endregion

//#region GraphQL Queries
const SEARCH_MEDIA_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type) {
    id
    title { romaji english native }
    description(asHtml: false)
    averageScore
    meanScore
    popularity
    favourites
    episodes
    chapters
    volumes
    duration
    status
    format
    source
    season
    seasonYear
    startDate { year month day }
    genres
    studios(isMain: true) { nodes { name } }
    coverImage { extraLarge large }
    siteUrl
    trailer { id site }
    rankings { rank type context }
  }
}`;

const TOP_MEDIA_QUERY = `
query ($type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: $type, sort: SCORE_DESC) {
      title { romaji english }
      averageScore
      format
      episodes
      genres
      siteUrl
    }
  }
}`;

const SEASON_NOW_QUERY = `
query ($season: MediaSeason, $year: Int, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      title { romaji english }
      averageScore
      genres
      siteUrl
    }
  }
}`;

const SEARCH_CHARACTER_QUERY = `
query ($search: String) {
  Character(search: $search) {
    name { full native }
    description(asHtml: false)
    favourites
    image { large }
    siteUrl
  }
}`;

const STATUS_MEDIA_QUERY = `
query ($status: MediaStatus, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(status: $status, type: ANIME, sort: POPULARITY_DESC) {
      title { romaji english }
      averageScore
      format
      episodes
      genres
      siteUrl
    }
  }
}`;
//#endregion

async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T | undefined> {
  const res = await axios.post<AniListGraphQLResponse<T>>(
    ANILIST_URL,
    { query, variables },
    { timeout: ANILIST_TIMEOUT, headers: { 'Content-Type': 'application/json' } }
  );

  if (res.data.errors && res.data.errors.length > 0) {
    throw new Error(res.data.errors[0]?.message || 'AniList API error');
  }

  return res.data.data;
}

function currentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let season: string;

  if (month >= 12 || month <= 2) {
    season = 'WINTER';
  } else if (month >= 3 && month <= 5) {
    season = 'SPRING';
  } else if (month >= 6 && month <= 8) {
    season = 'SUMMER';
  } else {
    season = 'FALL';
  }

  return { season, year: month === 12 ? year + 1 : year };
}

/**
 * Adapter: ubah response AniList jadi bentuk yang sama seperti item Jikan,
 * supaya bisa dipakai langsung oleh formatAnimeCaption/formatMangaCaption
 * di anime.ts tanpa duplikasi logic caption.
 */
function adaptAniListMedia(media: AniListMedia, _kind: 'anime' | 'manga'): JikanTitleItemLike {
  const title = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown';

  return {
    mal_id: media.id,
    title,
    title_english: media.title?.english ?? null,
    title_japanese: media.title?.native ?? null,
    synopsis: media.description ? media.description.replace(/<[^>]*>/g, '').trim() : null,
    score: media.averageScore ? media.averageScore / 10 : null,
    scored_by: null,
    rank: media.rankings?.find((r) => r.type === 'RATED')?.rank ?? null,
    popularity: media.popularity ?? null,
    members: media.favourites ?? null,
    episodes: media.episodes ?? null,
    chapters: media.chapters ?? null,
    volumes: media.volumes ?? null,
    duration: media.duration ? `${media.duration} min per ep` : null,
    status: media.status ?? 'Unknown',
    type: media.format ?? null,
    source: media.source ?? null,
    rating: null,
    season: media.season ?? null,
    year: media.seasonYear ?? media.startDate?.year ?? null,
    aired: media.startDate?.year
      ? {
          string: `${media.startDate.year}-${media.startDate.month ?? '?'}-${media.startDate.day ?? '?'}`,
        }
      : null,
    published: media.startDate?.year
      ? {
          string: `${media.startDate.year}-${media.startDate.month ?? '?'}-${media.startDate.day ?? '?'}`,
        }
      : null,
    genres: (media.genres ?? []).map((g: string) => ({ name: g })),
    studios: (media.studios?.nodes ?? []).map((s) => ({ name: s.name })),
    authors: [],
    trailer:
      media.trailer?.site === 'youtube' && media.trailer?.id
        ? { url: `https://www.youtube.com/watch?v=${media.trailer.id}` }
        : null,
    images: {
      jpg: {
        large_image_url: media.coverImage?.extraLarge ?? media.coverImage?.large ?? undefined,
        image_url: media.coverImage?.large ?? '', // Fallback ke string kosong untuk tipe mandatory string
      },
    },
    url: media.siteUrl,
  };
}
export async function getAnimeByStatusAniList(
  status: 'RELEASING' | 'FINISHED',
  limit = 10
): Promise<
  {
    title: string;
    score: number | null;
    type: string | null;
    episodes: number | null;
    genres: string[];
    url: string;
  }[]
> {
  const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(STATUS_MEDIA_QUERY, {
    status,
    perPage: limit,
  });
  return (data?.Page?.media ?? []).map((m) => ({
    title: m.title?.english || m.title?.romaji || 'Unknown',
    score: m.averageScore ? m.averageScore / 10 : null,
    type: m.format ?? null,
    episodes: m.episodes ?? null,
    genres: m.genres ?? [],
    url: m.siteUrl,
  }));
}

export async function searchAnimeAniList(query: string): Promise<JikanTitleItemLike | null> {
  const data = await anilistRequest<{ Media: AniListMedia }>(SEARCH_MEDIA_QUERY, {
    search: query,
    type: 'ANIME',
  });
  if (!data?.Media) {
    return null;
  }
  return adaptAniListMedia(data.Media, 'anime');
}

export async function searchMangaAniList(query: string): Promise<JikanTitleItemLike | null> {
  const data = await anilistRequest<{ Media: AniListMedia }>(SEARCH_MEDIA_QUERY, {
    search: query,
    type: 'MANGA',
  });
  if (!data?.Media) {
    return null;
  }
  return adaptAniListMedia(data.Media, 'manga');
}

export async function getTopAnimeAniList(limit = 10): Promise<
  {
    title: string;
    score: number | null;
    type: string | null;
    episodes: number | null;
    genres: string[];
    url: string;
  }[]
> {
  const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(TOP_MEDIA_QUERY, {
    type: 'ANIME',
    perPage: limit,
  });
  return (data?.Page?.media ?? []).map((m) => ({
    title: m.title?.english || m.title?.romaji || 'Unknown',
    score: m.averageScore ? m.averageScore / 10 : null,
    type: m.format ?? null,
    episodes: m.episodes ?? null,
    genres: m.genres ?? [],
    url: m.siteUrl,
  }));
}

export async function getSeasonNowAniList(
  limit = 10
): Promise<{ title: string; score: number | null; genres: string[]; url: string }[]> {
  const { season, year } = currentSeason();
  const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(SEASON_NOW_QUERY, {
    season,
    year,
    perPage: limit,
  });
  return (data?.Page?.media ?? []).map((m) => ({
    title: m.title?.english || m.title?.romaji || 'Unknown',
    score: m.averageScore ? m.averageScore / 10 : null,
    genres: m.genres ?? [],
    url: m.siteUrl,
  }));
}

export async function searchCharacterAniList(query: string): Promise<{
  name: string;
  nameKanji?: string;
  about?: string;
  imageUrl?: string;
  url: string;
  favorites?: number;
} | null> {
  const data = await anilistRequest<{ Character: AniListCharacter }>(SEARCH_CHARACTER_QUERY, {
    search: query,
  });
  const c = data?.Character;
  if (!c) {
    return null;
  }

  return {
    name: c.name?.full || c.name?.native || 'Unknown',
    nameKanji: c.name?.native ?? undefined,
    about: c.description ? c.description.replace(/<[^>]*>/g, '').trim() : 'Tidak ada deskripsi.',
    imageUrl: c.image?.large ?? undefined,
    url: c.siteUrl,
    favorites: c.favourites ?? undefined,
  };
}
