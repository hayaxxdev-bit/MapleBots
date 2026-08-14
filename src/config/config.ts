// src/config/config.ts
import 'dotenv/config';
import { z } from 'zod';
import path from 'path';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_PREFIX: z.string().min(1).max(5).default('.'),
  BOT_NAME: z.string().min(1).max(50).default('MapleBot'),
  OWNER_NUMBER: z.string().optional().default(''),
  JIKAN_BASE_URL: z.string().url().default('https://api.jikan.moe/v4'),
  TRACE_MOE_URL: z.string().url().default('https://api.trace.moe/search'),
  SESSION_DIR: z.string().optional().default('sessions'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BAILEYS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('warn'),
  DOWNLOAD_TIMEOUT: z.coerce.number().int().positive().max(120000).default(30000),
  MAX_FILE_SIZE: z.coerce.number().int().positive().max(100).default(50),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.issues);
  throw new Error('Environment validation failed. Check your .env file.');
}

const env = parsedEnv.data;

export interface BotConfig {
  readonly prefix: string;
  readonly botName: string;
  readonly ownerNumber: string;
  readonly jikanBaseUrl: string;
  readonly traceMoeUrl: string;
  readonly sessionDir: string;
  readonly logLevel: string;
  readonly baileysLogLevel: string;
  readonly downloadTimeout: number;
  readonly maxFileSizeMB: number;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
}

export const config: BotConfig = {
  prefix: env.BOT_PREFIX,
  botName: env.BOT_NAME,
  ownerNumber: env.OWNER_NUMBER,
  jikanBaseUrl: env.JIKAN_BASE_URL,
  traceMoeUrl: env.TRACE_MOE_URL,
  sessionDir: path.resolve(process.cwd(), env.SESSION_DIR),
  logLevel: env.LOG_LEVEL,
  baileysLogLevel: env.BAILEYS_LOG_LEVEL,
  downloadTimeout: env.DOWNLOAD_TIMEOUT,
  maxFileSizeMB: env.MAX_FILE_SIZE,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
} as const;

Object.freeze(config);