<div align="center">

# 🍁 MapleBot

**Advanced WhatsApp bot with modular scraper-based services — anime, manga, downloaders, and more.**

<p>
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg?cacheSeconds=2592000" alt="version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg" alt="node" />
  <img src="https://img.shields.io/badge/TypeScript-5.7.2-blue.svg" alt="typescript" />
  <img src="https://img.shields.io/badge/Baileys-7.0.0--rc14-red.svg" alt="baileys" />
  <img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="license" />
  <img src="https://img.shields.io/github/stars/hayaxxdev-bit/MapleBots?style=social" alt="stars" />
</p>

<p>
  <a href="#-fitur-utama">Fitur</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#️-konfigurasi">Konfigurasi</a> ·
  <a href="#-perintah-command">Perintah</a> ·
  <a href="#-struktur-proyek">Struktur</a> ·
  <a href="#-deployment">Deployment</a> ·
  <a href="#-kontribusi">Kontribusi</a>
</p>

</div>

---

## 📋 Daftar Isi

1. [Fitur Utama](#-fitur-utama)
2. [Quick Start](#-quick-start)
3. [Konfigurasi](#️-konfigurasi)
4. [Perintah (Command)](#-perintah-command)
5. [Struktur Proyek](#-struktur-proyek)
6. [Scraper & API](#-scraper--api)
7. [Development](#️-development)
8. [Deployment](#-deployment)
9. [Troubleshooting](#-troubleshooting)
10. [Roadmap](#️-roadmap)
11. [Kontribusi](#-kontribusi)
12. [Lisensi](#-lisensi)
13. [Disclaimer](#️-disclaimer)

---

## ✨ Fitur Utama

<table>
<tr>
<td width="50%" valign="top">

### 🤖 Bot Core
- Baileys **v7.0.0-rc14** (multi-device, tanpa perlu HP online terus)
- Auto-reconnect dengan session encryption
- Modular plugin architecture — tambah fitur tanpa sentuh core
- Multi-bahasa (ID / EN)
- Rate limiter & anti-spam bawaan

### 🎬 Anime & Manga
- Scraper: Otakudesu, Samehadaku, Anoboy, Kuramanime
- Manga: KomikCast, Mangadex, Komiku
- Search, detail, list episode/chapter, download
- Filter ongoing / complete, genre, rating
- Trace.moe (cari anime dari screenshot) & Jikan (info MAL)

</td>
<td width="50%" valign="top">

### 📥 Downloader Serbaguna
- YouTube (video & audio)
- TikTok (tanpa watermark)
- Instagram (post, reels, IGTV)
- Facebook & Twitter/X
- Direct-link downloader umum

### 💃 Waifu & Utility
- Waifu.im & Nekos.best (random image/GIF + tag)
- Sticker maker (image ↔ sticker)
- Wallpaper HD
- Translate teks
- Caching & logging dengan rotasi

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prasyarat

| Tool | Versi |
|---|---|
| Node.js | ≥ 18.x |
| pnpm | ≥ 8.x |
| ffmpeg | terbaru |

### Instalasi

```bash
# 1. Clone & masuk folder
git clone https://github.com/hayaxxdev-bit/MapleBots.git
cd MapleBots

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
nano .env          # sesuaikan OWNER_NUMBER, prefix, dll

# 4. Build & jalankan
pnpm build
pnpm start
```

Scan QR code yang muncul di terminal menggunakan WhatsApp di HP kamu (Linked Devices), lalu bot langsung siap dipakai.

### Mode Development

```bash
pnpm dev          # nodemon, auto-reload
pnpm dev:ts       # jalankan langsung via ts-node
pnpm type-check   # cek tipe TypeScript
pnpm lint         # ESLint
pnpm format       # Prettier
```

---

## ⚙️ Konfigurasi

### Variabel Utama (`.env`)

| Variabel | Deskripsi | Contoh |
|---|---|---|
| `BOT_PREFIX` | Prefix command bot | `.` |
| `BOT_NAME` | Nama bot | `MapleBot` |
| `OWNER_NUMBER` | Nomor owner (format internasional) | `6287774943469` |
| `BOT_MODE` | `public` / `private` / `group_only` | `public` |
| `ANIME_SCRAPER` | Scraper anime utama | `otakudesu` |
| `MANGA_SCRAPER` | Scraper manga utama | `komiku` |
| `AUTO_READ` | Auto read pesan masuk | `true` |
| `AUTO_TYPING` | Tampilkan status "typing…" | `true` |

Referensi lengkap semua opsi ada di [`.env.example`](.env.example).

### Scraper Fallback

Bot otomatis pindah ke scraper cadangan jika sumber utama down:

```env
ANIME_SCRAPER=otakudesu
ANIME_SCRAPER_FALLBACK=samehadaku,anoboy,kuramanime

SCRAPER_FALLBACK_ENABLED=true
SCRAPER_CACHE_ENABLED=true
SCRAPER_CACHE_TTL=3600
```

---

## 📱 Perintah (Command)

<details>
<summary><b>🔧 Dasar</b></summary>

| Command | Deskripsi |
|---|---|
| `.menu` | Tampilkan menu bot |
| `.help` | Bantuan perintah |
| `.ping` | Cek status/latency bot |
| `.info` | Info bot & sistem |

</details>

<details>
<summary><b>🎬 Anime</b></summary>

| Command | Deskripsi | Contoh |
|---|---|---|
| `.anime <judul>` | Cari anime | `.anime naruto` |
| `.anime detail <slug>` | Detail anime | `.anime detail naruto` |
| `.anime eps <slug>` | List episode | `.anime eps naruto` |
| `.anime download <slug> <eps>` | Download episode | `.anime download naruto 1` |
| `.ongoing` | List anime ongoing | `.ongoing` |
| `.complete` | List anime complete | `.complete` |
| `.trace` (reply gambar) | Cari anime dari screenshot | `.trace` |

</details>

<details>
<summary><b>📚 Manga</b></summary>

| Command | Deskripsi | Contoh |
|---|---|---|
| `.manga <judul>` | Cari manga | `.manga one-piece` |
| `.manga detail <slug>` | Detail manga | `.manga detail one-piece` |
| `.manga read <slug> <ch>` | Baca chapter | `.manga read one-piece 1` |

</details>

<details>
<summary><b>📥 Downloader</b></summary>

| Command | Deskripsi | Contoh |
|---|---|---|
| `.yt <url>` | Download YouTube | `.yt https://youtube.com/watch?v=...` |
| `.tiktok <url>` | Download TikTok | `.tiktok https://vt.tiktok.com/...` |
| `.ig <url>` | Download Instagram | `.ig https://instagram.com/p/...` |
| `.fb <url>` | Download Facebook | `.fb https://facebook.com/...` |
| `.tw <url>` | Download Twitter/X | `.tw https://x.com/...` |

</details>

<details>
<summary><b>💃 Waifu, Nekos & Utility</b></summary>

| Command | Deskripsi | Contoh |
|---|---|---|
| `.waifu [tag]` | Random waifu (opsional filter tag) | `.waifu maid` |
| `.nekos [category]` | Random nekos | `.nekos hug` |
| `.sticker` | Buat sticker (reply gambar) | `.sticker` |
| `.toimg` | Sticker → gambar (reply sticker) | `.toimg` |
| `.translate <text>` | Translate teks | `.translate hello` |

</details>

---

## 📁 Struktur Proyek

```
maple-bots/
├── src/
│   ├── config/              # env, constants, scraper config
│   ├── scrapers/
│   │   ├── anime/           # otakudesu, samehadaku, anoboy, kuramanime
│   │   ├── manga/            # komikcast, komiku, mangadex
│   │   ├── downloader/       # youtube, tiktok, instagram, facebook
│   │   └── api/              # waifu, nekos, trace.moe, jikan
│   ├── handlers/             # command, message, event handler
│   ├── utils/                 # logger, cache, database, helper
│   └── index.ts               # entry point
├── scripts/                    # post-build, test-scrapers
├── docs/                        # API.md, DEPLOYMENT.md, DEVELOPMENT.md
├── .github/workflows/            # CI/CD
├── .env.example
├── Dockerfile / docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## 🔌 Scraper & API

**Anime**

| Sumber | Status | Fitur |
|---|---|---|
| Otakudesu | ✅ | Search, Detail, Download |
| Samehadaku | ✅ | Search, Detail, Download |
| Anoboy | ✅ | Search, Detail, Streaming |
| Kuramanime | ✅ | Search, Detail, Download |

**Manga**

| Sumber | Status | Fitur |
|---|---|---|
| KomikCast | ✅ | Search, Read Online |
| Komiku | ✅ | Search, Read Online |
| Mangadex | ✅ | Search, Multi-language |

**API Pendukung**

| API | Status | Fungsi |
|---|---|---|
| Waifu.im | ✅ | Random waifu image + tag |
| Nekos.best | ✅ | Anime GIF/image |
| Jikan (MAL) | ✅ | Info anime/manga |
| Trace.moe | ✅ | Cari anime dari screenshot |

---

## 🛠️ Development

Proyek menggunakan **TypeScript (strict mode)**, **ESLint**, **Prettier**, dan **EditorConfig** untuk menjaga konsistensi kode.

```bash
# Test semua scraper
pnpm scrape:test

# Test scraper spesifik
ts-node scripts/test-scrapers.ts otakudesu
```

**Git workflow**

```bash
git checkout -b feature/nama-fitur
git commit -m "feat: tambah fitur baru"
git push origin feature/nama-fitur
# lalu buka Pull Request
```

---

## 🚢 Deployment

<details>
<summary><b>VPS + PM2</b></summary>

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs ffmpeg
npm install -g pnpm pm2

git clone https://github.com/hayaxxdev-bit/MapleBots.git
cd MapleBots
pnpm install --frozen-lockfile
cp .env.example .env && nano .env
pnpm build

pm2 start dist/index.js --name maple-bot
pm2 save && pm2 startup
```

</details>

<details>
<summary><b>Docker</b></summary>

```bash
docker-compose up -d
docker-compose logs -f
```

</details>

<details>
<summary><b>Railway / Heroku</b></summary>

1. Fork repository ini
2. Hubungkan ke Railway atau buat app baru di Heroku
3. Set environment variables sesuai `.env.example`
4. Deploy otomatis dari branch `main`

</details>

Panduan lengkap ada di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 🩺 Troubleshooting

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| QR code tidak muncul | Session lama corrupt | Hapus folder `sessions/` lalu jalankan ulang |
| Scraper gagal / kosong | Situs sumber down | Aktifkan `SCRAPER_FALLBACK_ENABLED=true` |
| Download gagal | ffmpeg tidak terinstall | Pastikan `ffmpeg -version` berjalan |
| Bot sering disconnect | Koneksi tidak stabil | Cek `AUTO_RECONNECT` & jaringan server |

---

## 🗺️ Roadmap

- [ ] Dashboard web untuk monitoring bot
- [ ] Plugin store / hot-reload plugin
- [ ] Database multi-session (MongoDB/PostgreSQL)
- [ ] Command permission per-role yang lebih granular

---

## 🤝 Kontribusi

1. Fork repo ini
2. Buat branch fitur: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m "feat: add amazing feature"`
4. Push: `git push origin feature/amazing-feature`
5. Buka Pull Request

Ikuti [Code of Conduct](CODE_OF_CONDUCT.md), gunakan TypeScript strict mode, dan sertakan dokumentasi untuk setiap fitur baru.

---

## 🙏 Credits

- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API
- [cheerio](https://cheerio.js.org/) · [axios](https://axios-http.com/) · [pino](https://getpino.io/) · [zod](https://zod.dev/)
- Sumber scraper: Otakudesu, Samehadaku, KomikCast, Komiku, Waifu.im, Nekos.best

---

## 📝 Lisensi

Dilisensikan di bawah **MIT License** — lihat [LICENSE](LICENSE) untuk detail lengkap.

---

## ⚠️ Disclaimer

Bot ini dibuat untuk **tujuan edukasi dan pembelajaran**. Pengguna bertanggung jawab penuh atas penggunaannya.

- ❌ Jangan gunakan untuk spam atau aktivitas ilegal
- ✅ Gunakan dengan bijak dan hormati Terms of Service WhatsApp

---

<div align="center">

Made with ❤️ by [hayaxxdev-bit](https://github.com/hayaxxdev-bit)

Jika project ini membantu, berikan ⭐ di GitHub!

</div>