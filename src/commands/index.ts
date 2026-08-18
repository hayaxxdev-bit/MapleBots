// src/commands/index.ts
import type { Command } from '../types';

// ============================================
// DOWNLOADER COMMANDS
// ============================================
import { tiktokCommand, tiktokAudioCommand } from './downloader/tiktok';
import {
  youtubeCommand,
  youtubeAudioCommand,
  youtubeInfoCommand,
  youtubeShortsCommand,
} from './downloader/youtube';
import {
  instagramCommand,
  instagramReelCommand,
  instagramStoryCommand,
} from './downloader/instagram';
import { facebookCommand, facebookReelCommand, facebookHdCommand } from './downloader/facebook';
import { generalDownloadCommand } from './downloader/general';

// ============================================
// ANIME COMMANDS
// ============================================
import { traceAnimeCommand } from './anime/traceAnime';
import {
  animeInfoCommand,
  mangaInfoCommand,
  animeTopCommand,
  animeSeasonCommand,
  animeCharacterCommand,
  animeOngoingCommand, // ← tambahan
  animeCompleteCommand,
} from './anime/animeInfo';
import { wallpaperCommand } from './anime/wallpaper';
import { waifuCommand } from './anime/waifu';
import { nekosCommand } from './anime/nekos';
// import { ongoingCommand } from './anime/ongoing';

// ============================================
// UTILITY COMMANDS
// ============================================
import { stickerCommand } from './utility/sticker';
// import { translateCommand } from './utility/translate';
// import { calcCommand } from './utility/calc';
// import { screenshotCommand } from './utility/screenshot';

// ============================================
// ADMIN COMMANDS
// ============================================
import { banCommand, unbanCommand } from './admin/ban';
// import { muteCommand, unmuteCommand } from './admin/mute';
// import { kickCommand } from './admin/kick';

// ============================================
// GENERAL COMMANDS
// ============================================
import { menuCommand } from './general/menu';
import { helpCommand } from './general/help';
import { pingCommand } from './general/ping';
// import { infoCommand } from './general/info';
import { statsCommand } from './general/stats';
import { twitterCommand } from './downloader/twitter';
import { pinterestCommand } from './downloader/pinterest';
import { jikanCommand } from './anime/jikan';
// import { uptimeCommand } from './general/uptime';

/**
 * ============================================
 * REGISTRY PUSAT SEMUA COMMANDS
 * ============================================
 *
 * Cara menambah command baru:
 * 1. Buat file di folder yang sesuai (downloader/anime/utility/admin/general)
 * 2. Import di bagian atas file ini
 * 3. Tambahkan ke array commands di bawah
 *
 * Cara menonaktifkan command:
 * 1. Comment import-nya
 * 2. Comment entry di array commands
 *
 * ============================================
 */
export const commands: readonly Command[] = Object.freeze([
  // ============================================
  // 📥 DOWNLOADER COMMANDS
  // ============================================
  tiktokCommand,
  tiktokAudioCommand,
  youtubeCommand,
  youtubeAudioCommand,
  youtubeInfoCommand,
  youtubeShortsCommand,
  instagramCommand,
  instagramReelCommand,
  instagramStoryCommand,
  facebookCommand,
  facebookReelCommand,
  facebookHdCommand,
  generalDownloadCommand,
  twitterCommand,
  pinterestCommand,

  // ============================================
  // 🎬 ANIME COMMANDS
  // ============================================
  animeInfoCommand,
  mangaInfoCommand,
  animeTopCommand,
  animeSeasonCommand,
  animeCharacterCommand,
  traceAnimeCommand,
  wallpaperCommand,
  animeOngoingCommand, // ← tambahan
  animeCompleteCommand,
  waifuCommand,
  jikanCommand,
  nekosCommand,
  //   ongoingCommand,

  // ============================================
  // 🛠️ UTILITY COMMANDS
  // ============================================
  stickerCommand,
  //   translateCommand,
  //   calcCommand,
  //   screenshotCommand,

  // ============================================
  // 👥 ADMIN COMMANDS
  // ============================================
  banCommand,
  unbanCommand,
  //   muteCommand,
  //   unmuteCommand,
  //   kickCommand,

  // ============================================
  // 📊 GENERAL COMMANDS
  // ============================================
  menuCommand,
  helpCommand,
  pingCommand,
  //   infoCommand,
  statsCommand,
  //   uptimeCommand,
]);

/**
 * Export default untuk memudahkan import
 */
export default commands;

/**
 * Export individual commands jika diperlukan
 */
export {
  // Downloader
  tiktokCommand,
  tiktokAudioCommand,
  youtubeCommand,
  youtubeAudioCommand,
  youtubeInfoCommand,
  youtubeShortsCommand,
  instagramCommand,
  instagramReelCommand,
  instagramStoryCommand,
  facebookCommand,
  facebookReelCommand,
  facebookHdCommand,
  generalDownloadCommand,
  twitterCommand,
  pinterestCommand,

  // Anime
  animeInfoCommand,
  animeTopCommand,
  animeSeasonCommand,
  animeCharacterCommand,
  mangaInfoCommand,
  traceAnimeCommand,
  wallpaperCommand,
  animeOngoingCommand, // ← tambahan
  animeCompleteCommand,
  waifuCommand,
  jikanCommand,
  nekosCommand,
  //   ongoingCommand,

  // Utility
  stickerCommand,
  //   translateCommand,
  //   calcCommand,
  //   screenshotCommand,

  // Admin
  banCommand,
  unbanCommand,
  //   muteCommand,
  //   unmuteCommand,
  //   kickCommand,

  // General
  menuCommand,
  helpCommand,
  pingCommand,
  //   infoCommand,
  statsCommand,
  //   uptimeCommand,
};
