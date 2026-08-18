import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';

import {
  getNekos,
  getNekosEndpoints,
  downloadNekosAsset,
  type NekosResult,
} from '../../infrastructure/api/providers/nekos.provider';

import {
  gifToMp4,
  convertToMp4,
} from '../../infrastructure/media/media-converter';

export const nekosCommand: Command = {
  name: 'nekos',

  aliases: ['neko', 'animegif'],

  category: 'nekos',

  description: 'Dapatkan anime image, GIF, atau video random dari Nekos.best.',

  usage: 'nekos [kategori]',

  cooldown: 10,

  handler: async (ctx) => {
    if (!config.features['nekos']) {
      await ctx.reply(
        '❌ Fitur nekos sedang dinonaktifkan.',
      );

      return;
    }

    try {
      const requestedCategory =
        ctx.args[0]?.toLowerCase();

      const category =
        requestedCategory ?? 'neko';

      /*
       * Discover categories directly
       * from Nekos.best.
       */
      const endpoints =
        await getNekosEndpoints();

      const endpoint =
        endpoints[category];

      /*
       * Validate category.
       */
      if (!endpoint) {
        const categories =
          Object.keys(endpoints);

        await ctx.reply(
          [
            '❌ Kategori tidak valid.',
            '',
            '📂 Kategori tersedia:',
            categories.join(', '),
          ].join('\n'),
        );

        return;
      }

      await ctx.reply(
        `🔍 Mencari ${category}...`,
      );

      /*
       * Request one random asset.
       */
      const results =
        await getNekos(category, 1);

      const result:
        | NekosResult
        | undefined = results[0];

      if (!result) {
        await ctx.reply(
          '❌ Tidak ada media ditemukan.',
        );

        return;
      }

      /*
       * Download asset.
       */
      const buffer =
        await downloadNekosAsset(
          result.url,
        );

      const format =
        endpoint.format.toLowerCase();

      /*
       * Build caption.
       */
      const caption = [
        '😺 *Nekos.best*',
        '',
        `📁 Category: ${category}`,
        `📦 Format: ${format}`,
        result.anime_name
          ? `🎭 Anime: ${result.anime_name}`
          : null,
        result.artist_name
          ? `🎨 Artist: ${result.artist_name}`
          : null,
      ]
        .filter(
          (value): value is string =>
            value !== null,
        )
        .join('\n');

      /*
       * GIF
       *
       * WhatsApp does not receive the original GIF
       * directly here. Convert GIF → MP4 first,
       * then send it with gifPlayback enabled.
       */
      if (format === 'gif') {
        const mp4Buffer =
          await gifToMp4(buffer);

        await ctx.replyGif(
          mp4Buffer,
          caption,
        );

        return;
      }

      /*
       * Video formats.
       *
       * WhatsApp transport uses MP4.
       */
      if (
        format === 'mp4' ||
        format === 'webm' ||
        format === 'mov'
      ) {
        const videoBuffer =
          format === 'mp4'
            ? buffer
            : await convertToMp4(
                buffer,
                format,
              );

        await ctx.replyVideo(
          videoBuffer,
          caption,
        );

        return;
      }

      /*
       * PNG/JPG/WebP/etc.
       */
      await ctx.replyImage(
        buffer,
        caption,
      );
    } catch (error) {
      logHelper.error(
        'nekos-command',
        error,
      );

      await ctx.reply(
        '❌ Gagal mendapatkan media dari Nekos.best.',
      );
    }
  },
};