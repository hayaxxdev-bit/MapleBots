import { metricsTracker } from './dashboard/metrics-tracker';

export function pushDashboardNotification(
  entry: Parameters<typeof metricsTracker.pushNotification>[0]
): void {
  metricsTracker.pushNotification(entry);
}
