// // src/commands/index.ts
// import type { Command } from '../types';

// // Downloader commands
// import { tiktokCommand, tiktokAudioCommand } from './downloader/tiktok';
// import { youtubeCommand, youtubeAudioCommand } from './downloader/youtube';
// import { instagramCommand } from './downloader/instagram';
// import { facebookCommand } from './downloader/facebook';
// import { twitterCommand } from './downloader/twitter';
// import { generalDownloadCommand } from './downloader/general';

// // Anime commands
// import { animeInfoCommand, mangaInfoCommand } from './anime/animeInfo';
// import { traceAnimeCommand } from './anime/traceAnime';
// import { wallpaperCommand } from './anime/wallpaper';
// import { waifuCommand } from './anime/waifu';
// import { nekosCommand } from './anime/nekos';

// // Utility commands
// import { stickerCommand } from './utility/sticker';
// import { translateCommand } from './utility/translate';
// import { calcCommand } from './utility/calc';
// import { screenshotCommand } from './utility/screenshot';

// // Admin commands
// import { banCommand, unbanCommand } from './admin/ban';
// import { muteCommand, unmuteCommand } from './admin/mute';
// import { kickCommand } from './admin/kick';

// // General commands
// import { menuCommand } from './general/menu';
// import { helpCommand } from './general/help';
// import { pingCommand } from './general/ping';
// import { infoCommand } from './general/info';
// import { statsCommand } from './general/stats';
// import { uptimeCommand } from './general/uptime';

// /**
//  * All registered commands.
//  */
// export const commands: readonly Command[] = Object.freeze([
//   // Downloader
//   tiktokCommand,
//   tiktokAudioCommand,
//   youtubeCommand,
//   youtubeAudioCommand,
//   instagramCommand,
//   facebookCommand,
//   twitterCommand,
//   generalDownloadCommand,
  
//   // Anime
//   animeInfoCommand,
//   mangaInfoCommand,
//   traceAnimeCommand,
//   wallpaperCommand,
//   waifuCommand,
//   nekosCommand,
  
//   // Utility
//   stickerCommand,
//   translateCommand,
//   calcCommand,
//   screenshotCommand,
  
//   // Admin
//   banCommand,
//   unbanCommand,
//   muteCommand,
//   unmuteCommand,
//   kickCommand,
  
//   // General
//   menuCommand,
//   helpCommand,
//   pingCommand,
//   infoCommand,
//   statsCommand,
//   uptimeCommand,
// ]);

// export default commands;