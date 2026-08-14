import { http, fetchBuffer } from '../../utils/httpClient';
import { isValidUrl, isTikTokUrl } from '../../utils/mediaHelper';
import type { Command, DownloadResult } from '../../types';

/**
 * Wrapper API pihak ketiga (tikwm.com) untuk resolve link TikTok
 * menjadi URL video tanpa watermark + audio (mp3).
 * Catatan: endpoint publik seperti ini bisa berubah sewaktu-waktu,
 * jadi struktur response divalidasi secara defensif.
 */
async function resolveTikTok(url: string): Promise<DownloadResult> {
  try {
    const res = await http.get('https://www.tikwm.com/api/', { params: { url } });
    const data = res.data?.data;

    if (!data || !data.play) {
      return { success: false, error: 'Data video tidak ditemukan dari API.' };
    }

    return {
      success: true,
      url: data.play as string, // video tanpa watermark
      caption: (data.title as string) || 'TikTok Video',
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export const tiktokCommand: Command = {
  name: 'tt',
  aliases: ['tiktok'],
  category: 'downloader',
  description: 'Download video TikTok tanpa watermark',
  usage: '.tt <url_tiktok>',
  handler: async (ctx) => {
    const url = ctx.args[0];

    if (!url || !isValidUrl(url)) {
      await ctx.reply('⚠️ Kirim link TikTok yang valid.\nContoh: .tt https://vt.tiktok.com/xxxxx');
      return;
    }
    if (!isTikTokUrl(url)) {
      await ctx.reply('⚠️ Link yang dikirim bukan link TikTok.');
      return;
    }

    await ctx.reply('⏳ Memproses video TikTok...');
    const result = await resolveTikTok(url);

    if (!result.success || !result.url) {
      await ctx.reply(`❌ Gagal mengambil video: ${result.error ?? 'link tidak valid atau video privat.'}`);
      return;
    }

    const buffer = await fetchBuffer(result.url);
    await ctx.replyMedia(buffer, 'video', result.caption);
  },
};

/** Sub-command terpisah khusus mengambil audio saja dari TikTok */
export const tiktokAudioCommand: Command = {
  name: 'ttmp3',
  aliases: ['ttaudio'],
  category: 'downloader',
  description: 'Download audio dari video TikTok',
  usage: '.ttmp3 <url_tiktok>',
  handler: async (ctx) => {
    const url = ctx.args[0];
    if (!url || !isValidUrl(url) || !isTikTokUrl(url)) {
      await ctx.reply('⚠️ Kirim link TikTok yang valid.\nContoh: .ttmp3 https://vt.tiktok.com/xxxxx');
      return;
    }

    await ctx.reply('⏳ Mengambil audio TikTok...');
    try {
      const res = await http.get('https://www.tikwm.com/api/', { params: { url } });
      const musicUrl = res.data?.data?.music as string | undefined;

      if (!musicUrl) {
        await ctx.reply('❌ Audio tidak ditemukan pada video ini.');
        return;
      }

      const buffer = await fetchBuffer(musicUrl);
      await ctx.replyMedia(buffer, 'audio');
    } catch (err) {
      await ctx.reply(`❌ Gagal mengambil audio: ${(err as Error).message}`);
    }
  },
};
