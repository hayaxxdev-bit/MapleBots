// src/types/index.ts
import type { WASocket, WAMessage, proto } from '@whiskeysockets/baileys';

// ============================================
// Media Types
// ============================================

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';
export type CommandCategory =
  'downloader' | 'anime' | 'manga' | 'waifu' | 'nekos' | 'utility' | 'admin' | 'general';

// ============================================
// Command Types
// ============================================
// tambahkan di src/types/index.ts
export interface JikanTitleItemLike {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  synopsis: string | null;
  score: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  episodes: number | null;
  chapters?: number | null;
  volumes?: number | null;
  duration?: string | null;
  status: string;
  type?: string | null;
  source?: string | null;
  rating?: string | null;
  season?: string | null;
  year?: number | null;
  aired?: { string?: string } | null;
  published?: { string?: string } | null;
  genres: { name: string }[];
  studios?: { name: string }[];
  authors?: { name: string }[];
  trailer?: { url?: string | null } | null;
  images: { jpg: { large_image_url?: string; image_url: string } };
  url: string;
}
export interface JikanAnimeResult {
  readonly malId: number;
  readonly title: string;
  readonly titleEnglish?: string;
  readonly titleJapanese?: string;
  readonly synopsis: string;
  readonly score: number | null;
  readonly scoredBy?: number;
  readonly episodes: number | null;
  readonly status: string;
  readonly airing: boolean;
  readonly genres: readonly string[];
  readonly studios?: readonly string[];
  readonly imageUrl: string;
  readonly url: string;
  readonly year?: number;
  readonly season?: string;
}

export interface JikanMangaResult {
  readonly malId: number;
  readonly title: string;
  readonly titleEnglish?: string;
  readonly synopsis: string;
  readonly score: number | null;
  readonly chapters: number | null;
  readonly volumes: number | null;
  readonly status: string;
  readonly genres: readonly string[];
  readonly imageUrl: string;
  readonly url: string;
}
export interface CommandContext {
  readonly sock: WASocket;
  readonly msg: WAMessage;
  readonly chatId: string;
  readonly sender: string;
  readonly senderName?: string;
  readonly args: readonly string[];
  readonly fullText: string;
  readonly isGroup: boolean;
  readonly groupId?: string;
  readonly isOwner: boolean;
  readonly isAdmin: boolean;
  readonly reply: (text: string) => Promise<void>;
  readonly replyMedia: (
    buffer: Buffer,
    type: MediaType,
    caption?: string,
    options?: MediaOptions
  ) => Promise<void>;
  readonly replySticker: (buffer: Buffer, options?: StickerOptions) => Promise<void>;
  readonly replyImage: (buffer: Buffer, caption?: string) => Promise<void>;
  readonly replyGif: (buffer: Buffer, caption?: string) => Promise<void>;
  readonly replyVideo: (buffer: Buffer, caption?: string) => Promise<void>;
  readonly replyAudio: (buffer: Buffer, options?: AudioOptions) => Promise<void>;
  readonly replyDocument: (buffer: Buffer, filename: string, caption?: string) => Promise<void>;
  readonly sendTyping: () => Promise<void>;
  readonly sendRecording: () => Promise<void>;
  readonly sendRead: () => Promise<void>;
}

export interface Command {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly category: CommandCategory;
  readonly description: string;
  readonly usage: string;
  readonly cooldown?: number;
  readonly isOwnerOnly?: boolean;
  readonly isAdminOnly?: boolean;
  readonly isGroupOnly?: boolean;
  readonly isPrivateOnly?: boolean;
  readonly handler: (ctx: CommandContext) => Promise<void>;
}

// ============================================
// Media Options
// ============================================

export interface MediaOptions {
  readonly mimetype?: string;
  readonly filename?: string;
  readonly caption?: string;
  readonly thumbnail?: Buffer;
  readonly width?: number;
  readonly height?: number;
  readonly quality?: number;
  readonly compression?: boolean;
}

export interface StickerOptions {
  readonly pack?: string;
  readonly author?: string;
  readonly categories?: readonly string[];
  readonly quality?: number;
  readonly maxSize?: number;
  readonly format?: 'webp' | 'png' | 'gif';
}

export interface AudioOptions {
  readonly mimetype?: string;
  readonly ptt?: boolean;
  readonly duration?: number;
  readonly waveform?: readonly number[];
}

// ============================================
// Downloader Types
// ============================================

export type DownloadStatus =
  'pending' | 'downloading' | 'completed' | 'failed' | 'retry' | 'timeout';
export type DownloadService =
  'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'pinterest' | 'general';

export interface DownloadResult {
  readonly success: boolean;
  readonly url?: string;
  readonly buffer?: Buffer;
  readonly caption?: string;
  readonly filename?: string;
  readonly mimetype?: string;
  readonly size?: number;
  readonly duration?: number;
  readonly thumbnail?: string;
  readonly title?: string;
  readonly quality?: string;
  readonly service?: DownloadService;
  readonly error?: string;
  readonly retryCount?: number;
}

export interface DownloadOptions {
  readonly timeout?: number;
  readonly maxSize?: number;
  readonly quality?: string;
  readonly withWatermark?: boolean;
  readonly extractAudio?: boolean;
  readonly onProgress?: (progress: number) => void;
}

export interface DownloadProgress {
  readonly service: DownloadService;
  readonly url: string;
  readonly status: DownloadStatus;
  readonly progress: number;
  readonly downloaded?: number;
  readonly total?: number;
  readonly speed?: number;
}

// ============================================
// Anime Types
// ============================================

export interface AnimeTitle {
  readonly romaji?: string;
  readonly english?: string;
  readonly native?: string;
  readonly synonyms?: readonly string[];
}

export interface AnimeSearchResult {
  readonly title: string;
  readonly slug: string;
  readonly thumbnail: string;
  readonly rating?: string;
  readonly status?: string;
  readonly genres?: readonly string[];
  readonly synopsis?: string;
  readonly source?: string;
}

export interface AnimeDetail extends AnimeSearchResult {
  readonly synopsis: string;
  readonly episodes: readonly AnimeEpisode[];
  readonly totalEpisodes: number;
  readonly duration?: string;
  readonly season?: string;
  readonly year?: number;
  readonly studios?: readonly string[];
}

export interface AnimeEpisode {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly uploadDate?: string;
  readonly thumbnail?: string;
}

export interface AnimeDownloadLink {
  readonly quality: string;
  readonly url: string;
  readonly size?: string;
  readonly format?: string;
}

export interface AnimeScraperInfo {
  readonly name: string;
  readonly url: string;
  readonly status: 'active' | 'down' | 'maintenance';
  readonly lastChecked: Date;
  readonly responseTime: number;
}

// ============================================
// Manga Types
// ============================================

export interface MangaSearchResult {
  readonly title: string;
  readonly slug: string;
  readonly thumbnail: string;
  readonly rating?: string;
  readonly status?: string;
  readonly genres?: readonly string[];
  readonly synopsis?: string;
  readonly source?: string;
}

export interface MangaDetail extends MangaSearchResult {
  readonly synopsis: string;
  readonly chapters: readonly MangaChapter[];
  readonly totalChapters: number;
  readonly author?: string;
  readonly artist?: string;
  readonly year?: number;
}

export interface MangaChapter {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly uploadDate?: string;
  readonly pages?: readonly string[];
}

// ============================================
// Waifu & Nekos Types
// ============================================

export interface WaifuImage {
  readonly url: string;
  readonly tags: readonly string[];
  readonly source?: string;
  readonly artist?: string;
  readonly dominantColor?: string;
  readonly isNsfw?: boolean;
}

export interface WaifuApiResponse {
  readonly images: readonly WaifuImage[];
}

export interface NekosImage {
  readonly url: string;
  readonly category: string;
  readonly anime?: string;
  readonly artist?: string;
  readonly source?: string;
}

export interface NekosApiResponse {
  readonly results: readonly NekosImage[];
}

// ============================================
// API Types
// ============================================

export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: number;
  readonly source?: string;
}

export interface TraceMoeResult {
  readonly filename: string;
  readonly anilist: {
    readonly title: AnimeTitle;
    readonly id?: number;
    readonly synonyms?: readonly string[];
  };
  readonly episode?: number | string;
  readonly from: number;
  readonly to: number;
  readonly similarity: number;
  readonly image: string;
  readonly video?: string;
}

export interface TraceMoeApiResponse {
  readonly frameCount: number;
  readonly error: string;
  readonly result: readonly TraceMoeResult[];
}

export interface JikanAnimeResult {
  readonly malId: number;
  readonly title: string;
  readonly titleEnglish?: string;
  readonly titleJapanese?: string;
  readonly synopsis: string;
  readonly score: number | null;
  readonly scoredBy?: number;
  readonly episodes: number | null;
  readonly status: string;
  readonly airing: boolean;
  readonly genres: readonly string[];
  readonly studios?: readonly string[];
  readonly imageUrl: string;
  readonly url: string;
  readonly year?: number;
  readonly season?: string;
}

export interface JikanMangaResult {
  readonly malId: number;
  readonly title: string;
  readonly titleEnglish?: string;
  readonly synopsis: string;
  readonly score: number | null;
  readonly chapters: number | null;
  readonly volumes: number | null;
  readonly status: string;
  readonly genres: readonly string[];
  readonly imageUrl: string;
  readonly url: string;
}

export interface JikanApiResponse<T> {
  readonly data: T;
  readonly pagination?: {
    readonly last_visible_page: number;
    readonly has_next_page: boolean;
  };
}

// ============================================
// Message Types
// ============================================

export interface ProcessedMessage {
  readonly chatId: string;
  readonly sender: string;
  readonly text: string;
  readonly isGroup: boolean;
  readonly isCommand: boolean;
  readonly command?: string;
  readonly args?: readonly string[];
}

export interface MessageResponse {
  readonly chatId: string;
  readonly text?: string;
  readonly media?: {
    readonly buffer: Buffer;
    readonly type: MediaType;
    readonly caption?: string;
  };
  readonly options?: Record<string, unknown>;
}

// ============================================
// Database Types
// ============================================

export interface UserData {
  readonly id: string;
  readonly username?: string;
  readonly premium: boolean;
  readonly banned: boolean;
  readonly totalCommands: number;
  readonly lastSeen: Date;
  readonly createdAt: Date;
}

export interface GroupData {
  readonly id: string;
  readonly name?: string;
  readonly enabled: boolean;
  readonly banned: boolean;
  readonly settings: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface CommandStats {
  readonly command: string;
  readonly count: number;
  readonly lastUsed: Date;
}

// ============================================
// Cache Types
// ============================================

export interface CacheEntry<T = unknown> {
  readonly value: T;
  readonly expiresAt: number;
  readonly createdAt: number;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly sets: number;
  readonly deletes: number;
  readonly keys: number;
  readonly size: unknown;
}

// ============================================
// Log Types
// ============================================

export interface LogEntry {
  readonly timestamp: Date;
  readonly level: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
  readonly error?: Error;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

// ============================================
// Queue Types
// ============================================

export interface QueueTask<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly data: T;
  readonly priority: number;
  readonly createdAt: Date;
  readonly execute: () => Promise<unknown>;
}

export interface QueueStats {
  readonly size: number;
  readonly activeCount: number;
  readonly maxConcurrent: number;
}

// ============================================
// Scraper Types
// ============================================

export interface ScraperHealth {
  readonly name: string;
  readonly type: string;
  readonly status: 'healthy' | 'degraded' | 'down';
  readonly lastCheck: Date;
  readonly responseTime: number;
  readonly errorCount: number;
  readonly successCount: number;
}

export interface ScraperResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly scraper?: string;
  readonly responseTime?: number;
}

// ============================================
// Utility Types
// ============================================

export type AsyncFunction<T = void> = () => Promise<T>;
export type ErrorHandler = (error: unknown, context?: string) => void;

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly backoffFactor?: number;
  readonly onRetry?: (attempt: number, error: Error) => void;
}

// ============================================
// Bot Configuration Types
// ============================================

export interface BotConfig {
  readonly prefix: string;
  readonly botName: string;
  readonly ownerNumber: string;
  readonly adminNumbers: readonly string[];
  readonly botMode: 'public' | 'private' | 'group_only';
  readonly allowedGroups: readonly string[];
  readonly features: Record<string, boolean>;
}

// ============================================
// Event Types
// ============================================

export interface BotEvent {
  readonly type: 'message' | 'command' | 'error' | 'connection' | 'download' | 'scraper';
  readonly timestamp: Date;
  readonly data: unknown;
}

// ============================================
// Re-export Baileys Types
// ============================================

export type { WASocket, WAMessage, proto };
