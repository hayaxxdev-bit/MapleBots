import { type Express } from 'express';
import { checkApiHealth, getApiRegistrySnapshot } from './api-health';
import { apiRegistry } from './api-registry';

/**
 * Mounts API telemetry routes without coupling the dashboard server
 * to individual API providers.
 */
export function registerApiDashboardRoutes(app: Express): void {
  app.get('/api/apis', async (_req, res) => {
    const snapshot = await getApiRegistrySnapshot();
    res.json({ ok: true, ...snapshot });
  });

  app.get('/api/apis/:id', async (req, res) => {
    const entry = apiRegistry.tryGetEntry(req.params.id);

    if (!entry) {
      res.status(404).json({
        ok: false,
        error: `API provider not found: ${req.params.id}`,
      });
      return;
    }

    const result = await checkApiHealth(req.params.id);
    const { config } = entry;

    res.json({
      
      ok: true,
      provider: {
        id: entry.provider.id,
        name: entry.provider.name,
        category: entry.provider.category,
        enabled: config.enabled ?? entry.provider.isEnabled(),
        configured: config.configured ?? true,
        endpoint: config.baseUrl,
        timeoutMs: config.timeoutMs,
        priority: config.priority,
        requiresApiKey: config.requiresApiKey ?? false,
        health: result.health,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
