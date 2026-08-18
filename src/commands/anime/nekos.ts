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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const execFileAsync = promisify(execFile);

const MAX_ATTEMPTS = 3;

/*
 * GIF yang normal tidak seharusnya mempunyai dimensi
 * seperti 49135x445.
 *
 * Batas ini bukan batas WhatsApp.
 * Ini hanya sanity check untuk mendeteksi file
 * yang kemungkinan corrupt / malformed sebelum
 * masuk ke gifToMp4().
 */
const MAX_MEDIA_DIMENSION = 8192;
const MAX_MEDIA_PIXELS = 25_000_000;

interface MediaProbe {
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  pix_fmt?: string;
}

async function probeMedia(
  buffer: Buffer,
  extension: string
): Promise<MediaProbe> {
  const tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'maplebot-nekos-check-')
  );

  const tempPath = path.join(
    tempDirectory,
    `input.${extension}`
  );

  try {
    await fs.writeFile(tempPath, buffer);

    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name,width,height,duration,pix_fmt',
        '-of',
        'json',
        tempPath,
      ],
      {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      }
    );

    const parsed = JSON.parse(stdout) as {
      streams?: MediaProbe[];
    };

    return parsed.streams?.[0] ?? {};
  } finally {
    await fs.rm(tempDirectory, {
      recursive: true,
      force: true,
    });
  }
}

function validateMediaDimensions(
  probe: MediaProbe,
  expectedFormat: string
): void {
  const width = Number(probe.width);
  const height = Number(probe.height);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(
      `Media ${expectedFormat} tidak memiliki dimensi yang valid: ${width}x${height}`
    );
  }

  if (width <= 0 || height <= 0) {
    throw new Error(
      `Media ${expectedFormat} memiliki dimensi invalid: ${width}x${height}`
    );
  }

  if (
    width > MAX_MEDIA_DIMENSION ||
    height > MAX_MEDIA_DIMENSION
  ) {
    throw new Error(
      `Media ${expectedFormat} memiliki dimensi abnormal: ${width}x${height}`
    );
  }

  const pixels = width * height;

  if (pixels > MAX_MEDIA_PIXELS) {
    throw new Error(
      `Media ${expectedFormat} terlalu besar: ${width}x${height} (${pixels} pixels)`
    );
  }
}

async function validateGif(buffer: Buffer): Promise<MediaProbe> {
  if (buffer.length === 0) {
    throw new Error('GIF kosong.');
  }

  const probe = await probeMedia(buffer, 'gif');

  if (probe.codec_name !== 'gif') {
    throw new Error(
      `File mengaku sebagai GIF tetapi codec terdeteksi sebagai ${probe.codec_name ?? 'unknown'}.`
    );
  }

  validateMediaDimensions(probe, 'GIF');

  return probe;
}

function buildCaption(
  category: string,
  format: string,
  result: NekosResult
): string {
  return [
    '😺 *Nekos.best*',
    '',
    `📁 Category: ${category}`,
    `📦 Format: ${format}`,
    result.anime_name ? `🎭 Anime: ${result.anime_name}` : null,
    result.artist_name ? `🎨 Artist: ${result.artist_name}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join('\n');
}

async function getValidResult(
  category: string,
  format: string
): Promise<{
  result: NekosResult;
  buffer: Buffer;
  probe?: MediaProbe;
}> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const results = await getNekos(category, 1);

      const result = results[0];

      if (!result) {
        throw new Error('Nekos.best tidak mengembalikan media.');
      }

      const buffer = await downloadNekosAsset(result.url);

      if (buffer.length === 0) {
        throw new Error('Nekos.best mengembalikan file kosong.');
      }

      /*
       * GIF adalah kasus yang sedang kita lindungi.
       */
      if (format === 'gif') {
        const probe = await validateGif(buffer);

        logHelper.info(
          'nekos-command',
          `Validated GIF: ${probe.width}x${probe.height}, ${buffer.length} bytes`
        );

        return {
          result,
          buffer,
          probe,
        };
      }

      /*
       * Untuk image/video lain, biarkan pipeline
       * existing menangani formatnya.
       */
      return {
        result,
        buffer,
      };
    } catch (error) {
      lastError = error;

      logHelper.warn(
        'nekos-command',
        `Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      if (attempt < MAX_ATTEMPTS) {
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gagal mendapatkan media Nekos.best.');
}

export const nekosCommand: Command = {
  name: 'nekos',

  aliases: ['neko', 'animegif'],

  category: 'nekos',

  description:
    'Dapatkan anime image, GIF, atau video random dari Nekos.best.',

  usage: 'nekos [kategori]',

  cooldown: 10,

  handler: async (ctx) => {
    if (!config.features['nekos']) {
      await ctx.reply('❌ Fitur nekos sedang dinonaktifkan.');

      return;
    }

    try {
      const requestedCategory = ctx.args[0]?.toLowerCase();

      const category = requestedCategory ?? 'neko';

      /*
       * Discover categories directly from Nekos.best.
       */
      const endpoints = await getNekosEndpoints();

      const endpoint = endpoints[category];

      /*
       * Validate category.
       */
      if (!endpoint) {
        const categories = Object.keys(endpoints);

        await ctx.reply(
          [
            '❌ Kategori tidak valid.',
            '',
            '📂 Kategori tersedia:',
            categories.join(', '),
          ].join('\n')
        );

        return;
      }

      await ctx.reply(`🔍 Mencari ${category}...`);

      const format = endpoint.format.toLowerCase();

      /*
       * Download + validate.
       *
       * Untuk GIF, file divalidasi menggunakan ffprobe
       * sebelum diberikan ke FFmpeg converter.
       *
       * Jika file corrupt / dimensinya abnormal,
       * kita meminta asset lain sampai MAX_ATTEMPTS.
       */
      const {
        result,
        buffer,
      } = await getValidResult(category, format);

      const caption = buildCaption(
        category,
        format,
        result
      );

      /*
       * GIF
       *
       * WhatsApp tidak menerima GIF mentah melalui
       * pipeline ini. GIF dikonversi menjadi MP4.
       */
      if (format === 'gif') {
        const mp4Buffer = await gifToMp4(buffer);

        await ctx.replyGif(mp4Buffer, caption);

        return;
      }

      /*
       * Video formats.
       */
      if (
        format === 'mp4' ||
        format === 'webm' ||
        format === 'mov'
      ) {
        const videoBuffer =
          format === 'mp4'
            ? buffer
            : await convertToMp4(buffer, format);

        await ctx.replyVideo(videoBuffer, caption);

        return;
      }

      /*
       * PNG / JPG / WebP / image lainnya.
       */
      await ctx.replyImage(buffer, caption);
    } catch (error) {
      logHelper.error('nekos-command', error);

      await ctx.reply(
        '❌ Gagal mendapatkan media dari Nekos.best.'
      );
    }
  },
};