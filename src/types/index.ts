// src/types/index.ts
import type { WASocket, proto } from '@whiskeysockets/baileys';

export type MediaType = 'image' | 'video' | 'audio' | 'document';
export type CommandCategory = 'downloader' | 'anime' | 'general';

export interface CommandContext {
  readonly sock: WASocket;
  readonly msg: proto.IWebMessageInfo;
  readonly chatId: string;
  readonly sender: string;
  readonly args: readonly string[];
  readonly fullText: string;
  readonly reply: (text: string) => Promise<void>;
  readonly replyMedia: (
    buffer: Buffer,
    type: MediaType,
    caption?: string,
  ) => Promise<void>;
}

export interface Command {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly category: CommandCategory;
  readonly description: string;
  readonly usage: string;
  readonly handler: (ctx: CommandContext) => Promise<void>;
}

export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';

export interface DownloadResult {
  readonly success: boolean;
  readonly url?: string;
  readonly buffer?: Buffer;
  readonly caption?: string;
  readonly filename?: string;
  readonly mimetype?: string;
  readonly size?: number;
  readonly error?: string;
}

export interface DownloadOptions {
  readonly timeout?: number;
  readonly maxSize?: number;
  readonly onProgress?: (progress: number) => void;
}

export interface AnimeTitle {
  readonly romaji?: string;
  readonly english?: string;
  readonly native?: string;
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

export interface ApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly timestamp: number;
}

export interface TraceMoeApiResponse {
  readonly frameCount: number;
  readonly error: string;
  readonly result: readonly TraceMoeResult[];
}

export interface JikanApiResponse<T> {
  readonly data: T;
  readonly pagination?: {
    readonly last_visible_page: number;
    readonly has_next_page: boolean;
  };
}

export interface ProcessedMessage {
  readonly chatId: string;
  readonly sender: string;
  readonly text: string;
  readonly isGroup: boolean;
  readonly isCommand: boolean;
  readonly command?: string;
  readonly args?: readonly string[];
}

export type AsyncFunction<T = void> = () => Promise<T>;
export type ErrorHandler = (error: unknown, context?: string) => void;

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly backoffFactor?: number;
}

export type { WASocket, proto };