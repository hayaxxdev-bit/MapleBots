import { fromBuffer as fileTypeFromBuffer } from 'file-type';
import { fetchBuffer } from '../../utils/httpClient';
import { isValidUrl } from '../../utils/mediaHelper';
import type { Command, MediaType } from '../../types';

/** Batas ukuran file yang diizinkan (dalam byte) agar tidak membebani bot/WA */
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Map MIME type hasil deteksi ke MediaType internal bot */
function mimeToMediaType(mime: string): MediaType {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  return 'document';
}

export const generalDownloadCommand: Command = {
  name: 'dl',
  aliases: ['download', 'get'],
  category: 'downloader',
  description: 'Download file dari direct link URL (media/dokumen)',
  usage: '.dl <direct_url>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url)) {
      await ctx.reply('⚠️ Kirim direct link file yang valid.\nContoh: .dl https://example.com/file.pdf');
      return;
    }

    await ctx.reply('⏳ Mengunduh file dari link...');

    try {
      const buffer = await fetchBuffer(url);

      if (buffer.byteLength > MAX_FILE_SIZE) {
        await ctx.reply('❌ File terlalu besar (maksimal 100MB).');
        return;
      }

      // Deteksi tipe file dari isi buffer (bukan sekadar ekstensi URL) agar lebih akurat
      const detected = await fileTypeFromBuffer(buffer);
      const mediaType = detected ? mimeToMediaType(detected.mime) : 'document';
      const fileName = url.split('/').pop()?.split('?')[0] || 'file';

      await ctx.replyMedia(buffer, mediaType, fileName);
    } catch (err) {
      await ctx.reply(`❌ Gagal mengunduh file: ${(err as Error).message}. Pastikan link bisa diakses langsung.`);
    }
  },
};
