// src/commands/general/help.ts
import type { Command, CommandContext } from '../../types';
import { getAllCommands, commands } from '../../handlers/commandHandler';
import { config } from '../../config/config';

/**
 * Format daftar command per kategori.
 */
function formatCommandList(commandList: readonly Command[]): string {
  return commandList
    .map((cmd) => {
      const aliases = cmd.aliases && cmd.aliases.length > 0 
        ? ` (${cmd.aliases.join(', ')})` 
        : '';
      return `┃ ${config.prefix}${cmd.name}${aliases}\n┃ └─ ${cmd.description}`;
    })
    .join('\n');
}

/**
 * Buat pesan bantuan yang terformat.
 */
function createHelpMessage(): string {
  const downloaderCommands = commands.filter(cmd => cmd.category === 'downloader');
  const animeCommands = commands.filter(cmd => cmd.category === 'anime');
  const generalCommands = commands.filter(cmd => cmd.category === 'general');

  const sections: string[] = [];

  // Header
  sections.push(
    `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃     ✨ ${config.botName.toUpperCase()} BOT ✨     ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
    `Prefix: ${config.prefix}\n`
  );

  // Downloader commands
  if (downloaderCommands.length > 0) {
    sections.push(
      `\n╭━━━━ 📥 DOWNLOADER ━━━━╮\n` +
      formatCommandList(downloaderCommands) +
      `\n╰━━━━━━━━━━━━━━━━━━━━━╯`
    );
  }

  // Anime commands
  if (animeCommands.length > 0) {
    sections.push(
      `\n╭━━━━ 🎬 ANIME ━━━━╮\n` +
      formatCommandList(animeCommands) +
      `\n╰━━━━━━━━━━━━━━━━━━╯`
    );
  }

  // General commands
  if (generalCommands.length > 0) {
    sections.push(
      `\n╭━━━━ 🛠️ GENERAL ━━━━╮\n` +
      formatCommandList(generalCommands) +
      `\n╰━━━━━━━━━━━━━━━━━━━╯`
    );
  }

  // Footer
  sections.push(
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 Tips: Gunakan ${config.prefix}help <command> untuk detail command tertentu.`
  );

  return sections.join('\n');
}

/**
 * Command handler untuk menampilkan bantuan.
 */
export const helpCommand: Command = {
  name: 'help',
  aliases: ['menu', 'h', '?'],
  category: 'general',
  description: 'Menampilkan daftar semua command yang tersedia',
  usage: '.help [command]',
  handler: async (ctx: CommandContext): Promise<void> => {
    const { args, reply } = ctx;

    // Jika ada argumen, tampilkan detail command tertentu
    if (args.length > 0) {
      const commandName = args[0]?.toLowerCase();
      const command = getAllCommands().find(
        (cmd) => 
          cmd.name.toLowerCase() === commandName || 
          cmd.aliases?.includes(commandName ?? '')
      );

      if (command) {
        const aliasText = command.aliases && command.aliases.length > 0
          ? `\n📝 Aliases: ${command.aliases.join(', ')}`
          : '';
        
        await reply(
          `╭━━━━ 📋 DETAIL COMMAND ━━━━╮\n` +
          `┃ Nama: ${command.name}\n` +
          `┃ Kategori: ${command.category}\n` +
          `┃ Deskripsi: ${command.description}\n` +
          `┃ Usage: ${command.usage}${aliasText}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━━╯`
        );
      } else {
        await reply(
          `❌ Command "${args[0]}" tidak ditemukan.\n` +
          `Gunakan ${config.prefix}help untuk melihat daftar command.`
        );
      }
      return;
    }

    // Tampilkan semua command
    const helpMessage = createHelpMessage();
    await reply(helpMessage);
  },
};