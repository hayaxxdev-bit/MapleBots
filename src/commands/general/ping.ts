// src/commands/general/ping.ts
import type { Command } from '../../types';

export const pingCommand: Command = {
  name: 'ping',
  aliases: ['p'],
  category: 'general',
  description: 'Cek status bot',
  usage: 'ping',
  cooldown: 5,

  handler: async (ctx) => {
    const startTime = Date.now();

    await ctx.reply('🏓 Pong!');

    const responseTime = Date.now() - startTime;

    await ctx.reply(
      `⏱️ *Response Time:* ${responseTime}ms\n` + `📡 *Status:* Online\n` + `🤖 *Bot:* Aktif`
    );
  },
};
