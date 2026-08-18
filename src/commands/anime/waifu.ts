import type { Command } from '../../types';
import { config } from '../../config/config';
import { logHelper } from '../../utils/logger';

interface WaifuImage {
  id: number;
  url: string;
  width?: number;
  height?: number;
  byteSize?: number;
  isNsfw?: boolean;
  isAnimated?: boolean;
  source?: string;
  artist?: {
    name?: string;
  };
  tags?: Array<{
    name: string;
    slug: string;
  }>;
}

interface WaifuApiResponse {
  items?: WaifuImage[];
  pageNumber?: number;
  totalPages?: number;
  totalCount?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
}

const WAIFU_API = 'https://api.waifu.im';

export const waifuCommand: Command = {
  name: 'waifu',
  aliases: ['waifus', 'waifuim'],
  category: 'waifu',
  description: 'Dapatkan gambar anime random dari Waifu.im',
  usage: 'waifu [tag]',
  cooldown: 10,

  handler: async (ctx) => {
    if (!config.features['waifu']) {
      await ctx.reply(
        '❌ Fitur waifu sedang dinonaktifkan.',
      );
      return;
    }

    const tag = ctx.args.join(' ').trim();

    try {
      await ctx.reply(
        '🖼️ Mencari waifu...',
      );

      const params = new URLSearchParams();

      params.set('PageSize', '1');
      params.set('IsNsfw', 'False');

      if (tag) {
        params.set(
          'IncludedTags',
          tag,
        );
      }

      const endpoint =
        `${WAIFU_API}/images?${params.toString()}`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(
          `Waifu.im returned HTTP ${response.status}`,
        );
      }

      const data =
        (await response.json()) as WaifuApiResponse;

      const image = data.items?.[0];

      if (!image?.url) {
        await ctx.reply(
          tag
            ? `❌ Tidak ada waifu dengan tag *${tag}*.`
            : '❌ Tidak ada gambar waifu ditemukan.',
        );
        return;
      }

      const imageResponse = await fetch(
        image.url,
      );

      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download image: HTTP ${imageResponse.status}`,
        );
      }

      const buffer = Buffer.from(
        await imageResponse.arrayBuffer(),
      );

      const tags =
        image.tags
          ?.map((item) => item.name)
          .join(', ') || 'Unknown';

      const caption = [
        '🌸 *Waifu.im*',
        '',
        `🆔 ID: ${image.id}`,
        `🏷️ Tags: ${tags}`,
        `📐 Size: ${image.width ?? '?'} × ${image.height ?? '?'}`,
        image.artist?.name
          ? `🎨 Artist: ${image.artist.name}`
          : '',
        '',
        '🍁 MapleBot',
      ]
        .filter(Boolean)
        .join('\n');

      await ctx.replyMedia(
        buffer,
        'image',
        caption,
      );
    } catch (error) {
      logHelper.error(
        'waifu-command',
        error,
      );

      await ctx.reply(
        '❌ Gagal mendapatkan gambar dari Waifu.im.',
      );
    }
  },
};