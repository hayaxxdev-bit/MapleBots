import type { proto } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { http } from '../../utils/httpClient';
import { config } from '../../config/config';
import type { Command, TraceMoeResult } from '../../types';

/** Ambil objek quoted message (pesan yang di-reply), jika ada */
function getQuotedMessage(msg: proto.IWebMessageInfo): proto.IWebMessageInfo | null {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;

  return {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: ctx.quotedMessage,
  };
}

/** Kirim buffer gambar ke API trace.moe untuk dicari sumber anime-nya */
async function traceAnime(imageBuffer: Buffer): Promise<TraceMoeResult | null> {
  const res = await http.post(config.traceMoeUrl, imageBuffer, {
    headers: { 'Content-Type': 'image/jpeg' },
  });

  const results = res.data?.result as TraceMoeResult[] | undefined;
  if (!results || results.length === 0) return null;

  // Hasil pertama = kecocokan tertinggi (trace.moe sudah mengurutkan)
  return results[0] ?? null;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const traceAnimeCommand: Command = {
  name: 'trace',
  aliases: ['whatanime', 'searchanime'],
  category: 'anime',
  description: 'Cari judul anime dari screenshot/gambar (reply gambar dengan command ini)',
  usage: 'Reply sebuah gambar dengan: .trace',
  handler: async (ctx) => {
    const quoted = getQuotedMessage(ctx.msg);
    const targetMsg = quoted?.message?.imageMessage ? quoted : ctx.msg.message?.imageMessage ? ctx.msg : null;

    if (!targetMsg) {
      await ctx.reply('⚠️ Reply/kirim sebuah gambar (screenshot anime) beserta command .trace');
      return;
    }

    await ctx.reply('🔍 Mencari anime dari gambar...');

    try {
      // Unduh gambar dari pesan WhatsApp (baik gambar langsung maupun hasil reply)
      const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});
      const result = await traceAnime(buffer as Buffer);

      if (!result) {
        await ctx.reply('❌ Anime tidak ditemukan dari gambar ini. Coba screenshot yang lebih jelas.');
        return;
      }

      const title =
        result.anilist.title.english ?? result.anilist.title.romaji ?? result.anilist.title.native ?? 'Tidak diketahui';
      const similarity = (result.similarity * 100).toFixed(1);

      const caption =
        `🎬 *${title}*\n` +
        (result.episode ? `📺 Episode: ${result.episode}\n` : '') +
        `⏱️ Timestamp: ${formatTimestamp(result.from)} - ${formatTimestamp(result.to)}\n` +
        `🎯 Kemiripan: ${similarity}%`;

      await ctx.reply(caption);
    } catch (err) {
      await ctx.reply(`❌ Gagal melakukan trace: ${(err as Error).message}`);
    }
  },
};
