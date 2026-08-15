// src/commands/anime/nekos.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logger, logHelper } from '../../utils/logger';

const NEKOS_CATEGORIES = [
  'hug', 'kiss', 'pat', 'wave', 'cry', 'laugh', 'dance',
  'smile', 'poke', 'slap', 'bite', 'blush', 'bored',
  'facepalm', 'feed', 'happy', 'highfive', 'pout',
  'shrug', 'sleep', 'stare', 'thumbsup', 'tickle',
  'wink', 'yeet',
];

export const nekosCommand: Command = {
  name: 'nekos',
  aliases: ['neko', 'animegif'],
  category: 'nekos',
  description: 'Dapatkan anime GIF random',
  usage: 'nekos [kategori]',
  cooldown: 10,
  
  handler: async (ctx) => {
    if (!config.features['nekos']) {
      await ctx.reply('❌ Fitur nekos sedang dinonaktifkan.');
      return;
    }
    
    const category = ctx.args[0]?.toLowerCase();
    
    // Validate category
    if (category && !NEKOS_CATEGORIES.includes(category)) {
      const categoryList = NEKOS_CATEGORIES.join(', ');
      await ctx.reply(`❌ Kategori tidak valid!\n\nKategori yang tersedia:\n${categoryList}`);
      return;
    }
    
    try {
      await ctx.reply('🔍 Mencari anime GIF...');
      
      const apiUrl = config.nekosApi === 'nekos_best'
        ? 'https://nekos.best/api/v2'
        : 'https://nekos.best/api/v2';
      
      const endpoint = category 
        ? `${apiUrl}/${category}`
        : `${apiUrl}/neko`;
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const result = (data as any).results?.[0];
      
      if (!result) {
        await ctx.reply('❌ Tidak ada GIF ditemukan.');
        return;
      }
      
      // Download GIF
      const imageResponse = await fetch(result.url);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      
      const caption = 
        `😺 *Nekos Found!*\n` +
        `📁 Category: ${category || 'neko'}\n` +
        `🎭 Anime: ${result.anime_name || 'Unknown'}`;
      
      await ctx.replyMedia(buffer, 'image', caption);
      
    } catch (error) {
      logHelper.error('nekos-command', error);
      await ctx.reply('❌ Gagal mendapatkan anime GIF.');
    }
  },
};