// src/commands/general/menu.ts
import type { Command } from '../../types';
import { config } from '../../config/config';
import { getAllCommands } from '../../handlers/commandHandler';

export const menuCommand: Command = {
  name: 'menu',
  aliases: ['m', 'menu'],
  category: 'general',
  description: 'Tampilkan menu bot',
  usage: 'menu',
  cooldown: 10,

  handler: async (ctx) => {
    const commands = getAllCommands();
    const categories = new Map<string, Command[]>();

    // Group commands by category
    commands.forEach((cmd) => {
      const categoryCommands = categories.get(cmd.category) || [];
      categoryCommands.push(cmd);
      categories.set(cmd.category, categoryCommands);
    });

    let menuText = `*${config.botName} Menu*\n\n`;

    categories.forEach((cmds, category) => {
      menuText += `╭─ *${category.toUpperCase()}*\n`;
      cmds.forEach((cmd) => {
        menuText += `│ ├ ${config.prefix}${cmd.usage}\n`;
        menuText += `│ │ └ ${cmd.description}\n`;
      });
      menuText += `╰──────────────\n\n`;
    });

    menuText += `\nKetik ${config.prefix}help <command> untuk info detail.`;

    await ctx.reply(menuText);
  },
};
