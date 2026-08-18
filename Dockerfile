# ============================================================
# MapleBot Dockerfile
# Multi-stage production build
# ============================================================


# ============================================================
# 1. BUILDER
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Native build dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    ffmpeg

# Enable Corepack and pnpm
RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate

# Copy dependency manifests first
# This allows Docker to cache dependency installation.
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source
COPY src ./src

# Copy dashboard/frontend
COPY public ./public

# Build application
RUN pnpm build


# ============================================================
# 2. PRODUCTION RUNNER
# ============================================================

FROM node:20-alpine AS runner

WORKDIR /app

# Runtime dependencies only
RUN apk add --no-cache \
    ffmpeg \
    libc6-compat

# Enable Corepack and pnpm
RUN corepack enable \
    && corepack prepare pnpm@8.15.0 --activate

# Production environment
ENV NODE_ENV=production

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install \
    --prod \
    --frozen-lockfile

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy dashboard
COPY --from=builder /app/public ./public

# Copy example environment only
COPY .env.example ./.env.example

# Runtime directories
RUN mkdir -p \
    /app/data \
    /app/data/sessions \
    /app/data/backups \
    /app/logs \
    /app/temp

# Application port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]