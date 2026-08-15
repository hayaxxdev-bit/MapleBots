// src/commands/utility/sticker.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logger, logHelper } from '../../utils/logger';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

export const stickerCommand: Command = {
  name: 'sticker',
  aliases: ['stiker', 's'],
  category: 'utility',
  description: 'Buat sticker dari gambar',
  usage: 'sticker [nama_pack] | [author]',
  cooldown: 10,
  
  handler: async (ctx) => {
    if (!config.features['sticker']) {
      await ctx.reply('❌ Fitur sticker sedang dinonaktifkan.');
      return;
    }
    
    // Check if message has image
    const msgContent = ctx.msg.message;
    const imageMessage = msgContent?.imageMessage;
    
    if (!imageMessage) {
      await ctx.reply('❌ Kirim gambar dengan caption .sticker\n\nContoh: Kirim gambar lalu tambahkan caption .sticker');
      return;
    }
    
    await ctx.reply('⏳ Membuat sticker...');
    
    try {
      // Download image
    const buffer = await downloadMediaMessage(ctx.msg, 'buffer', {});
      
      if (!buffer) {
        await ctx.reply('❌ Gagal download gambar.');
        return;
      }
      
      // Parse pack and author from args
      const fullArgs = ctx.args.join(' ');
      const [pack, author] = fullArgs.split('|').map(s => s.trim());
      
      const stickerOptions = {
        pack: pack || config.botName,
        author: author || config.ownerNumber,
      };
      
      // Send sticker
      await ctx.sock.sendMessage(ctx.chatId, {
        sticker: buffer,
        ...stickerOptions,
      }, { quoted: ctx.msg });
      
      logHelper.command({
        sender: ctx.sender,
        command: 'sticker',
        args: ctx.args,
      });
      
    } catch (error) {
      logHelper.error('sticker-command', error);
      await ctx.reply('❌ Gagal membuat sticker.');
    }
  },
};