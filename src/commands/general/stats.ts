// src/commands/general/stats.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { getAllCommands } from '../../handlers/commandHandler';
import { CacheManager } from '../../utils/cache';

export const statsCommand: Command = {
  name: 'stats',
  aliases: ['statistic'],
  category: 'general',
  description: 'Statistik bot',
  usage: 'stats',
  cooldown: 10,

  handler: async (ctx) => {
    try {
      const commands = getAllCommands();
      const cache = CacheManager.getInstance();
      const cacheStats = cache.getStats();

      const statsText =
        `📊 *${config.botName} Statistics*\n\n` +
        `🤖 *Bot Info:*\n` +
        `├ Version: 2.0.0\n` +
        `├ Mode: ${config.botMode}\n` +
        `├ Prefix: ${config.prefix}\n` +
        `└ Commands: ${commands.length}\n\n` +
        `💾 *Cache:*\n` +
        `├ Keys: ${cacheStats.keys}\n` +
        `├ Hits: ${cacheStats.hits}\n` +
        `└ Misses: ${cacheStats.misses}\n\n` +
        `⚙️ *Features:*\n` +
        Object.entries(config.features)
          .filter(([, enabled]) => enabled)
          .map(([feature]) => `├ ✅ ${feature}`)
          .join('\n');

      await ctx.reply(statsText);
    } catch (error) {
      //   logHelper.error('stats-command', error);
      console.error('stats-command', error);
      await ctx.reply('❌ Gagal mengambil statistik.');
    }
  },
};
