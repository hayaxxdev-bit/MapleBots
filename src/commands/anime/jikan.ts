import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';
import {
  jikanProvider,
  type JikanSearchResponse,
} from '../../infrastructure/api/providers/jikan.provider';
import { notificationService } from '@/infrastructure/notification/notification-service';

export const jikanCommand: Command = {
  name: 'jikan',

  aliases: ['anime', 'mal'],

  category: 'anime',

  description: 'Cari anime menggunakan Jikan API.',

  usage: 'jikan <judul anime>',

  cooldown: 5,

  handler: async (ctx) => {
    if (!config.features['anime']) {
      await ctx.reply('❌ Fitur anime sedang dinonaktifkan.');
      return;
    }

    const query = ctx.args.join(' ').trim();

    if (!query) {
      await ctx.reply('❌ Masukkan judul anime.\n\n' + 'Contoh: `.jikan naruto`');
      return;
    }

    try {
      await ctx.reply('🔎 Mencari anime...');

      const params = new URLSearchParams({
        q: query,
        limit: '1',
      });

      const result = await jikanProvider.request<JikanSearchResponse>(
        `/anime?${params.toString()}`
      );

      const anime = result.data?.[0];

      if (!anime) {
        await ctx.reply(`❌ Anime "${query}" tidak ditemukan.`);
        return;
      }

      const caption = [
        `🎌 *${anime.title}*`,
        '',
        anime.title_english ? `🇬🇧 ${anime.title_english}` : null,
        anime.title_japanese ? `🇯🇵 ${anime.title_japanese}` : null,
        anime.score != null ? `⭐ Score: ${anime.score}` : null,
        anime.episodes != null ? `📺 Episodes: ${anime.episodes}` : null,
        anime.status ? `📡 Status: ${anime.status}` : null,
        '',
        anime.synopsis ? anime.synopsis.slice(0, 700) : 'Tidak ada synopsis.',
      ]
        .filter(Boolean)
        .join('\n');

      const imageUrl = anime.images?.jpg?.large_image_url ?? anime.images?.jpg?.image_url;

      if (imageUrl) {
        const imageResponse = await fetch(imageUrl);

        if (imageResponse.ok) {
          const buffer = Buffer.from(await imageResponse.arrayBuffer());

          await ctx.replyMedia(buffer, 'image', caption);

          return;
        }
      }

      await ctx.reply(caption);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));

      logHelper.error('jikan-command', normalizedError);

      await notificationService.sendErrorNotification(normalizedError, {
        module: 'jikan-command',
        command: `.jikan ${ctx.args.join(' ')}`.trim(),
        sender: ctx.sender,
        senderName: ctx.senderName,
        chatId: ctx.chatId,
        action: 'Fetch anime from Jikan API',
      });

      await ctx.reply('❌ Gagal mengambil data anime dari Jikan API.');
    }
  },
};
