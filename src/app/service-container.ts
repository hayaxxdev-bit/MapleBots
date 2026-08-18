// src/core/service-container.ts
import { logger } from '../infrastructure/logging/logger';

export interface Disposable {
  dispose(): Promise<void> | void;
}

type ServiceFactory<T> = (...args: unknown[]) => Promise<T> | T;
type ServiceDependency = string | symbol;

interface ServiceDefinition<T> {
  factory: ServiceFactory<T>;
  dependencies?: ServiceDependency[];
  singleton?: boolean;
  instance?: T;
}

function isDisposable(obj: unknown): obj is Disposable {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'dispose' in obj &&
    typeof (obj as { dispose: unknown }).dispose === 'function'
  );
}

export class ServiceContainer {
  private services: Map<ServiceDependency, ServiceDefinition<unknown>> = new Map();
  private instances: Map<ServiceDependency, unknown> = new Map();

  register<T>(
    name: ServiceDependency,
    factory: ServiceFactory<T>,
    options: { dependencies?: ServiceDependency[]; singleton?: boolean } = {}
  ): void {
    if (this.services.has(name)) {
      logger.warn(`Service "${String(name)}" is already registered, replacing...`);
    }

    this.services.set(name, {
      factory,
      dependencies: options.dependencies,
      singleton: options.singleton ?? true,
    });

    logger.debug(`Service registered: ${String(name)}`);
  }

  async resolve<T>(name: ServiceDependency): Promise<T> {
    const definition = this.services.get(name);
    if (!definition) {
      throw new Error(`Service "${String(name)}" not found in container`);
    }

    // Return existing instance if singleton
    if (definition.singleton && this.instances.has(name)) {
      return this.instances.get(name) as T;
    }

    // Resolve dependencies
    const dependencies: unknown[] = [];
    if (definition.dependencies) {
      for (const dep of definition.dependencies) {
        dependencies.push(await this.resolve(dep));
      }
    }

    // Create instance
    const instance = await definition.factory(...dependencies);

    // Store instance if singleton
    if (definition.singleton) {
      this.instances.set(name, instance);
    }

    return instance as T;
  }

  async initialize(): Promise<void> {
    logger.info('🔧 Initializing service container...');

    for (const [name] of this.services) {
      try {
        await this.resolve(name);
        logger.debug(`Service initialized: ${String(name)}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(err, `Failed to initialize service "${String(name)}"`);
        throw error;
      }
    }
  }

  async dispose(): Promise<void> {
    logger.info('🧹 Disposing service container...');

    for (const [name, instance] of this.instances) {
      if (isDisposable(instance)) {
        try {
          await instance.dispose();
          logger.debug(`Service disposed: ${String(name)}`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error(err, `Failed to dispose service "${String(name)}"`);
        }
      }
    }

    this.instances.clear();
  }
}
