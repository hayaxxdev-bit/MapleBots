// src/utils/browserManager.ts
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { logHelper } from '../logging/logger';

/**
 * Singleton browser instance untuk keperluan scraping yang butuh JS
 * (Pinterest search, dll). Browser dibuka sekali dan di-reuse, bukan
 * dibuka-tutup tiap request — jauh lebih hemat resource & waktu.
 */
class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.launchPromise) {
      return this.launchPromise;
    }

    this.launchPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    this.browser = await this.launchPromise;
    this.launchPromise = null;

    logHelper.info('browser-manager', 'Chromium browser launched');

    this.browser.on('disconnected', () => {
      logHelper.warn('browser-manager', 'Browser disconnected, will relaunch on next use');
      this.browser = null;
    });

    return this.browser;
  }

  async newContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    return browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'id-ID',
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logHelper.info('browser-manager', 'Chromium browser closed');
    }
  }
}

export const browserManager = BrowserManager.getInstance();
