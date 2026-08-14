# Maple Bots - WhatsApp Bot

Advanced WhatsApp Bot with TypeScript, featuring all-in-one downloader & anime services.

## ✨ Features

- 📥 **Multi-Platform Downloader**: YouTube, TikTok, Instagram, Facebook
- 🎬 **Anime Services**: Info lookup, scene trace, wallpapers
- 🔒 **Type-Safe**: Built with TypeScript for reliability
- 🚀 **High Performance**: Optimized with streaming & caching
- 🛡️ **Robust**: Centralized error handling & retry mechanisms
- 📊 **Logging**: Multi-target logging with Pino

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/maple-bots.git
cd maple-bots

# Install dependencies
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Build
pnpm build

# Start
pnpm start
```

### Development

```bash
# Development mode with hot reload
pnpm dev

# Type checking
pnpm type-check

# Linting
pnpm lint

# Formatting
pnpm format
```

### 📁 Project Structure
 ```
src/
├── config/         # Configuration files
├── types/          # TypeScript type definitions
├── services/       # Business logic services
├── handlers/       # Event & message handlers
├── commands/       # Bot commands
├── utils/          # Utility functions
├── interfaces/     # Interface definitions
├── constants/      # Constants & enums
└── middlewares/    # Middleware functions
 ```

 ### Configuration

 ```
Copy .env.example to .env and configure:

    BOT_PREFIX: Command prefix (default: .)

    BOT_NAME: Bot name

    OWNER_NUMBER: Owner WhatsApp number

    API endpoints and timeout settings

📖 Available Commands
Downloader

    .yt <url> - Download YouTube video

    .tt <url> - Download TikTok video

    .ig <url> - Download Instagram media

    .fb <url> - Download Facebook video

Anime

    .anime <name> - Get anime information

    .trace <image> - Trace anime from image

    .wallpaper <query> - Get anime wallpaper

General

    .help - Show help menu

    .ping - Check bot status

🛠️ Tech Stack

    Runtime: Node.js

    Language: TypeScript

    WhatsApp: @whiskeysockets/baileys

    Package Manager: pnpm

    Logger: Pino

    HTTP Client: Axios

    Media: fluent-ffmpeg, ffmpeg-static

📝 License

MIT © [Your Name]
🤝 Contributing

Contributions, issues, and feature requests are welcome!
📧 Contact

    GitHub: @yourusername

    Email: your.email@example.com
 ```


## 🔑 Key Changes Summary

### Package.json:
- Updated to Baileys v7
- Added fluent-ffmpeg & ffmpeg-static for media processing
- Added ESLint, Prettier, Husky for code quality
- Enhanced scripts for better DX
- Added packageManager field

### .env:
- Organized into sections
- Added comprehensive configuration options
- Added retry & timeout settings
- Added media processing configs

### tsconfig.json:
- Stricter TypeScript checks
- Path aliases for cleaner imports
- Better module resolution
- Experimental decorators support

### Development Tools:
- Added nodemon config
- Added prettier & eslint configs
- Enhanced gitignore
- Better README documentation
# MapleBots
