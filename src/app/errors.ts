// src/core/errors.ts
export class BotInitializationError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'BotInitializationError';
  }
}

export class ServiceHealthError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly healthStatus: string
  ) {
    super(message);
    this.name = 'ServiceHealthError';
  }
}

export class GracefulShutdownError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'GracefulShutdownError';
  }
}
