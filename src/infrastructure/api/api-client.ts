// src/infrastructure/api/api-client.ts

import { logger } from '../logging/logger';

export interface ApiClientOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

export class ApiClient {
  private readonly defaultTimeoutMs: number;

  constructor(options: ApiClientOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 15_000;
  }

  async get<T>(url: string, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'GET',
      ...options,
    });
  }

  async getBuffer(url: string, options: ApiClientOptions = {}): Promise<Buffer> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: options.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      logger.warn(
        {
          url,
          timeoutMs,
          error,
        },
        'External API binary request failed'
      );

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async post<T>(url: string, body: unknown, options: ApiClientOptions = {}): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  }

  async request<T>(url: string, options: RequestInit & ApiClientOptions = {}): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';

      let body: unknown;

      if (contentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      if (!response.ok) {
        let message = `API request failed: ${response.status} ${response.statusText}`;

        if (
          typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof body.message === 'string'
        ) {
          message = body.message;
        }

        const error = new Error(message);

        Object.assign(error, {
          status: response.status,
          response: body,
        });

        throw error;
      }

      return body as T;
    } catch (error) {
      logger.warn(
        {
          url,
          timeoutMs,
          error,
        },
        'External API request failed'
      );

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const apiClient = new ApiClient();
