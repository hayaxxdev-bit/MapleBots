// src/commands/admin/ban.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { logger, logHelper } from '../../utils/logger';
import { DatabaseManager } from '../../utils/database';

export const banCommand: Command = {
  name: 'ban',
  aliases: ['banned'],
  category: 'admin',
  description: 'Ban user dari bot',
  usage: 'ban <nomor> [alasan]',
  cooldown: 5,
  isOwnerOnly: true,
  
  handler: async (ctx) => {
    const target = ctx.args[0];
    const reason = ctx.args.slice(1).join(' ') || 'Tidak ada alasan';
    
    if (!target) {
      await ctx.reply(`❌ Masukkan nomor yang akan di-ban!\n\nContoh: ${config.prefix}ban 6281234567890`);
      return;
    }
    
    try {
      const db = DatabaseManager.getInstance();
      const targetNumber = target.replace(/[^0-9]/g, '');
      
      // Save banned user
      await db.set('banned', targetNumber, {
        reason,
        bannedBy: ctx.sender,
        bannedAt: new Date().toISOString(),
      });
      
      logHelper.command({
        sender: ctx.sender,
        command: 'ban',
        args: ctx.args,
      });
      
      await ctx.reply(
        `✅ User berhasil di-ban!\n\n` +
        `👤 User: ${targetNumber}\n` +
        `📝 Alasan: ${reason}\n` +
        `👮 Oleh: ${ctx.sender}`
      );
      
    } catch (error) {
      logHelper.error('ban-command', error);
      await ctx.reply('❌ Gagal mem-ban user.');
    }
  },
};

export const unbanCommand: Command = {
  name: 'unban',
  aliases: ['unbanned'],
  category: 'admin',
  description: 'Unban user dari bot',
  usage: 'unban <nomor>',
  cooldown: 5,
  isOwnerOnly: true,
  
  handler: async (ctx) => {
    const target = ctx.args[0];
    
    if (!target) {
      await ctx.reply(`❌ Masukkan nomor yang akan di-unban!\n\nContoh: ${config.prefix}unban 6281234567890`);
      return;
    }
    
    try {
      const db = DatabaseManager.getInstance();
      const targetNumber = target.replace(/[^0-9]/g, '');
      
      // Remove from banned list
      await db.delete('banned', targetNumber);
      
      await ctx.reply(`✅ User ${targetNumber} berhasil di-unban!`);
      
    } catch (error) {
      logHelper.error('unban-command', error);
      await ctx.reply('❌ Gagal meng-unban user.');
    }
  },
};