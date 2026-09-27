// Where the Worker lives: `extra.apiBaseUrl` in app.json (localhost in development; the real URL is an
// owner item). The app version goes with the device registration.
import Constants from 'expo-constants';

export function apiBaseUrl(): string {
  const url: unknown = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof url !== 'string' || url.length === 0) throw new Error('extra.apiBaseUrl is not set');
  return url;
}

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}
