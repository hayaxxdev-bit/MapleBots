// src/utils/httpClient.ts
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
// src/utils/httpClient.ts — tambahkan di axiosInstance
import * as http from 'http';
import * as https from 'https';

import { config } from '../../config/config';
import { logger } from '../logging/logger';

/**
 * Interface untuk response dari HTTP request.
 */
export interface HttpClientResponse<T = Buffer> {
  readonly data: T;
  readonly status: number;
  readonly headers: Record<string, string>;
}

/**
 * Custom error class untuk HTTP errors.
 */
export class HttpClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'HttpClientError';
    Error.captureStackTrace(this, HttpClientError);
  }
}

/**
 * Konfigurasi untuk retry mechanism.
 */
interface RetryConfig {
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly retryStatusCodes: readonly number[];
}

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryStatusCodes: [408, 429, 500, 502, 503, 504],
} as const;

/**
 * Instance axios terpusat dengan konfigurasi konsisten.
 */
const axiosInstance: AxiosInstance = axios.create({
  timeout: config.downloadTimeout,
  maxContentLength: config.maxFileSizeMB * 1024 * 1024,
  maxBodyLength: config.maxFileSizeMB * 1024 * 1024,
  httpAgent: new http.Agent({ family: 4 }),
  httpsAgent: new https.Agent({ family: 4 }),
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
  },
  validateStatus: (status: number): boolean => status >= 200 && status < 300,
});

/**
 * Request interceptor untuk logging.
 */
axiosInstance.interceptors.request.use(
  (requestConfig) => {
    logger.debug({ method: requestConfig.method, url: requestConfig.url }, 'HTTP Request');
    return requestConfig;
  },
  (error: unknown) => {
    logger.error({ error }, 'HTTP Request interceptor error');
    return Promise.reject(error);
  }
);

/**
 * Response interceptor untuk logging dan error handling.
 */
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    logger.debug(
      {
        status: response.status,
        url: response.config.url,
        size: response.headers['content-length'] ?? 'unknown',
      },
      'HTTP Response'
    );
    return response;
  },
  (error: unknown) => {
    if (error instanceof AxiosError) {
      logger.warn(
        {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        },
        'HTTP Request failed'
      );
    }
    return Promise.reject(error);
  }
);

/**
 * Sleep utility untuk retry delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error should be retried based on status code.
 */
function shouldRetry(error: unknown, retryConfig: RetryConfig): boolean {
  if (error instanceof AxiosError) {
    const statusCode = error.response?.status;
    return statusCode !== undefined && retryConfig.retryStatusCodes.includes(statusCode);
  }
  return false;
}

/**
 * Execute HTTP request with retry mechanism.
 */
async function requestWithRetry<T>(
  requestFn: () => Promise<AxiosResponse<T>>,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<AxiosResponse<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      if (attempt < retryConfig.maxRetries && shouldRetry(error, retryConfig)) {
        const delay = retryConfig.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(
          { attempt, maxRetries: retryConfig.maxRetries, delay },
          `Retrying HTTP request in ${delay}ms`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Normalize error to HttpClientError.
 */
function normalizeError(error: unknown, url: string): HttpClientError {
  if (error instanceof HttpClientError) {
    return error;
  }

  if (error instanceof AxiosError) {
    return new HttpClientError(error.message, error.response?.status, url, error);
  }

  return new HttpClientError(
    `Unknown error occurred while fetching: ${url}`,
    undefined,
    url,
    error
  );
}

/**
 * Mengunduh file dari URL langsung menjadi Buffer.
 * @param url - URL file yang akan diunduh
 * @param config - Axios request config tambahan
 * @returns Promise<Buffer> - Buffer dari file yang diunduh
 * @throws HttpClientError - Jika download gagal
 */
export async function fetchBuffer(url: string, config?: AxiosRequestConfig): Promise<Buffer> {
  try {
    const response = await requestWithRetry<ArrayBuffer>(() =>
      axiosInstance.get<ArrayBuffer>(url, {
        ...config,
        responseType: 'arraybuffer',
      })
    );

    return Buffer.from(response.data);
  } catch (error) {
    throw normalizeError(error, url);
  }
}

/**
 * Fetch JSON data from URL.
 * @param url - URL untuk fetch JSON
 * @param config - Axios request config tambahan
 * @returns Promise<T> - Parsed JSON data
 * @throws HttpClientError - Jika fetch gagal
 */
export async function fetchJson<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await requestWithRetry<T>(() =>
      axiosInstance.get<T>(url, {
        ...config,
        responseType: 'json',
      })
    );

    return response.data;
  } catch (error) {
    throw normalizeError(error, url);
  }
}

/**
 * POST JSON data to URL.
 * @param url - Target URL
 * @param data - Data yang akan dikirim
 * @param config - Axios request config tambahan
 * @returns Promise<T> - Response data
 * @throws HttpClientError - Jika request gagal
 */
export async function postJson<T = unknown, D = Record<string, unknown>>(
  url: string,
  data: D,
  config?: AxiosRequestConfig
): Promise<T> {
  try {
    const response = await requestWithRetry<T>(() =>
      axiosInstance.post<T>(url, data, {
        ...config,
        headers: {
          'Content-Type': 'application/json',
          ...config?.headers,
        },
      })
    );

    return response.data;
  } catch (error) {
    throw normalizeError(error, url);
  }
}

/**
 * Download file dengan progress tracking.
 * @param url - URL file
 * @param onProgress - Callback untuk progress
 * @returns Promise<Buffer> - File buffer
 */
export async function fetchBufferWithProgress(
  url: string,
  onProgress?: (progress: number) => void
): Promise<Buffer> {
  try {
    const response = await axiosInstance.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(Math.round(progress));
        }
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    throw normalizeError(error, url);
  }
}

// Export default instance untuk kasus penggunaan khusus
export { axiosInstance as http };
export type { RetryConfig };
