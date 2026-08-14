// src/utils/mediaHelper.ts
import { URL } from 'url';

/**
 * Interface untuk format number options.
 */
export interface FormatNumberOptions {
  readonly locale?: string;
  readonly notation?: 'standard' | 'scientific' | 'engineering' | 'compact';
  readonly maximumFractionDigits?: number;
}

/**
 * Enum untuk platform types.
 */
export enum Platform {
  TIKTOK = 'tiktok',
  YOUTUBE = 'youtube',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TWITTER = 'twitter',
  UNKNOWN = 'unknown',
}

// Add to src/utils/mediaHelper.ts

/**
 * Validate file size against maximum limit
 * @param buffer - File buffer
 * @param maxSizeMb - Maximum size in MB
 * @returns boolean - True if valid
 * @throws Error - If file too large
 */
export function validateFileSize(
  buffer: Buffer, 
  maxSizeMb: number
): boolean {
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error(`File terlalu besar! Maksimal ${maxSizeMb}MB`);
  }
  return true;
}
/**
 * Interface untuk platform detection result.
 */
export interface PlatformDetection {
  readonly platform: Platform;
  readonly isValid: boolean;
  readonly videoId?: string;
}

/**
 * Default options untuk format number.
 */
const DEFAULT_FORMAT_OPTIONS: FormatNumberOptions = {
  locale: 'id-ID',
  notation: 'standard',
  maximumFractionDigits: 2,
} as const;

/**
 * Check apakah string adalah URL yang valid.
 * @param text - String yang akan divalidasi
 * @returns boolean - True jika valid URL
 */
export function isValidUrl(text: string): boolean {
  if (!text || text.length === 0) {
    return false;
  }
  
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract video ID from YouTube URL.
 * @param url - YouTube URL
 * @returns string | undefined - Video ID atau undefined
 */
function extractYouTubeId(url: string): string | undefined {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
    /(?:youtube\.com\/shorts\/)([^?\s]+)/,
  ] as const;
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Extract post/video ID from TikTok URL.
 * @param url - TikTok URL
 * @returns string | undefined - Post/video ID
 */
function extractTikTokId(url: string): string | undefined {
  const patterns = [
    /(?:tiktok\.com\/@[^/]+\/video\/)(\d+)/,
    /(?:tiktok\.com\/v\/)(\d+)/,
    /(?:vm\.tiktok\.com\/)([^/?]+)/,
  ] as const;
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Detect platform dari URL.
 * @param url - URL yang akan dideteksi
 * @returns PlatformDetection - Hasil deteksi platform
 */
export function detectPlatform(url: string): PlatformDetection {
  if (!isValidUrl(url)) {
    return {
      platform: Platform.UNKNOWN,
      isValid: false,
    };
  }
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // YouTube detection
    if (/(youtube\.com|youtu\.be)$/i.test(hostname)) {
      return {
        platform: Platform.YOUTUBE,
        isValid: true,
        videoId: extractYouTubeId(url),
      };
    }
    
    // TikTok detection
    if (/tiktok\.com$/i.test(hostname)) {
      return {
        platform: Platform.TIKTOK,
        isValid: true,
        videoId: extractTikTokId(url),
      };
    }
    
    // Instagram detection
    if (/instagram\.com$/i.test(hostname)) {
      return {
        platform: Platform.INSTAGRAM,
        isValid: true,
      };
    }
    
    // Facebook detection
    if (/(facebook\.com|fb\.watch)$/i.test(hostname)) {
      return {
        platform: Platform.FACEBOOK,
        isValid: true,
      };
    }
    
    return {
      platform: Platform.UNKNOWN,
      isValid: false,
    };
  } catch {
    return {
      platform: Platform.UNKNOWN,
      isValid: false,
    };
  }
}

/**
 * Check jika URL adalah TikTok URL.
 * @param url - URL yang akan dicek
 * @returns boolean - True jika TikTok URL
 */
export function isTikTokUrl(url: string): boolean {
  return detectPlatform(url).platform === Platform.TIKTOK;
}

/**
 * Check jika URL adalah YouTube URL.
 * @param url - URL yang akan dicek
 * @returns boolean - True jika YouTube URL
 */
export function isYoutubeUrl(url: string): boolean {
  return detectPlatform(url).platform === Platform.YOUTUBE;
}

/**
 * Check jika URL adalah Instagram URL.
 * @param url - URL yang akan dicek
 * @returns boolean - True jika Instagram URL
 */
export function isInstagramUrl(url: string): boolean {
  return detectPlatform(url).platform === Platform.INSTAGRAM;
}

/**
 * Check jika URL adalah Facebook URL.
 * @param url - URL yang akan dicek
 * @returns boolean - True jika Facebook URL
 */
export function isFacebookUrl(url: string): boolean {
  return detectPlatform(url).platform === Platform.FACEBOOK;
}

/**
 * Format angka besar menjadi lebih ringkas.
 * @param num - Angka yang akan diformat
 * @param options - Format options
 * @returns string - Angka yang sudah diformat
 */
export function formatNumber(
  num: number,
  options: FormatNumberOptions = DEFAULT_FORMAT_OPTIONS,
): string {
  if (!Number.isFinite(num)) {
    return '0';
  }
  
  try {
    return new Intl.NumberFormat(options.locale ?? 'id-ID', {
      notation: options.notation ?? 'standard',
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
    }).format(num);
  } catch {
    // Fallback jika locale tidak valid
    return num.toLocaleString('id-ID');
  }
}

/**
 * Format angka kompak (contoh: 1000 -> 1K, 1000000 -> 1M).
 * @param num - Angka yang akan diformat
 * @returns string - Angka kompak
 */
export function formatCompactNumber(num: number): string {
  return formatNumber(num, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/**
 * Potong teks panjang agar tidak membanjiri chat.
 * @param text - Teks yang akan dipotong
 * @param maxLength - Panjang maksimum (default: 700)
 * @param suffix - Suffix untuk teks yang dipotong (default: '...')
 * @returns string - Teks yang sudah dipotong
 */
export function truncate(text: string, maxLength = 700, suffix = '...'): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  // Potong pada batas kata jika memungkinkan
  const truncated = text.slice(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.slice(0, lastSpaceIndex).trim() + suffix;
  }
  
  return truncated.trim() + suffix;
}

/**
 * Format durasi dari detik ke format yang readable.
 * @param seconds - Durasi dalam detik
 * @returns string - Durasi terformat (contoh: "2:30" atau "1:02:30")
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size dari bytes ke format yang readable.
 * @param bytes - Ukuran file dalam bytes
 * @returns string - Ukuran terformat (contoh: "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  
  if (unitIndex === 0) {
    return `${bytes} ${units[0]}`;
  }
  
  const value = bytes / Math.pow(1024, unitIndex);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}