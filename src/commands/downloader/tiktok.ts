// src/commands/downloader/tiktok.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logger, logHelper } from '../../utils/logger';
import { ValidationHelper, FileHelper } from '../../utils/helper'; // <-- Import helper yang benar

export const tiktokCommand: Command = {
  name: 'tiktok',
  aliases: ['tt', 'tik'],
  category: 'downloader',
  description: 'Download video TikTok',
  usage: 'tiktok <url>',
  cooldown: 10,
  
  handler: async (ctx) => {
    const url = ctx.args[0];
    
    if (!url) {
      await ctx.reply(`❌ Masukkan URL TikTok!\n\nContoh: ${config.prefix}tiktok https://vt.tiktok.com/xxxxx`);
      return;
    }
    
    // Menggunakan ValidationHelper
    if (!ValidationHelper.isUrl(url)) {
      await ctx.reply('❌ URL tidak valid!');
      return;
    }
    
    await ctx.reply('⏳ Mendownload video TikTok...');
    
    try {
      logHelper.downloader('tiktok', url, 'START');
      
      const apiUrl = config.tiktokConfig['apiUrl'] as string;
      const response = await fetch(`${apiUrl}?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      
      if (!data.data) {
        throw new Error('No video data found');
      }
      
      const videoUrl = data.data.play || data.data.hdplay || data.data.wmplay;
      const title = data.data.title || 'TikTok Video';
      const author = data.data.author?.nickname || 'Unknown';
      
      // Download video
      const videoResponse = await fetch(videoUrl);
      const buffer = Buffer.from(await videoResponse.arrayBuffer());
      
      const caption = 
        `🎵 *TikTok Video*\n` +
        `📝 Title: ${title}\n` +
        `👤 Author: ${author}\n` +
        `📦 Size: ${FileHelper.formatFileSize(buffer.length)}`; // <-- Menggunakan FileHelper
      
      logHelper.downloader('tiktok', url, 'SUCCESS', `Size: ${buffer.length}`);
      
      await ctx.replyMedia(buffer, 'video', caption);
      
    } catch (error) {
      logHelper.downloader('tiktok', url, 'FAILED');
      logHelper.error('tiktok-download', error);
      await ctx.reply('❌ Gagal mendownload video TikTok.');
    }
  },
};

export const tiktokAudioCommand: Command = {
  name: 'tiktokaudio',
  aliases: ['tta', 'tiktokmp3'],
  category: 'downloader',
  description: 'Download audio TikTok',
  usage: 'tiktokaudio <url>',
  cooldown: 10,
  
  handler: async (ctx) => {
    const url = ctx.args[0];
    
    if (!url) {
      await ctx.reply(`❌ Masukkan URL TikTok!\n\nContoh: ${config.prefix}tiktokaudio https://vt.tiktok.com/xxxxx`);
      return;
    }
    
    // Menggunakan ValidationHelper
    if (!ValidationHelper.isUrl(url)) {
      await ctx.reply('❌ URL tidak valid!');
      return;
    }
    
    await ctx.reply('⏳ Mendownload audio TikTok...');
    
    try {
      logHelper.downloader('tiktok', url, 'START', 'audio');
      
      const apiUrl = config.tiktokConfig['apiUrl'] as string;
      const response = await fetch(`${apiUrl}?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      
      if (!data.data) {
        throw new Error('No audio data found');
      }
      
      const audioUrl = data.data.music || data.data.music_info?.url;
      const title = data.data.title || 'TikTok Audio';
      
      if (!audioUrl) {
        await ctx.reply('❌ Audio tidak ditemukan.');
        return;
      }
      
      // Download audio
      const audioResponse = await fetch(audioUrl);
      const buffer = Buffer.from(await audioResponse.arrayBuffer());
      
      logHelper.downloader('tiktok', url, 'SUCCESS', `Audio size: ${buffer.length}`);
      
      await ctx.replyMedia(buffer, 'audio', title);
      
    } catch (error) {
      logHelper.downloader('tiktok', url, 'FAILED');
      logHelper.error('tiktok-audio-download', error);
      await ctx.reply('❌ Gagal mendownload audio TikTok.');
    }
  },
};