import { PARTNER_API_PREFIX, keyEnvironment } from '@foodops-partner/client';

export interface Settings {
  baseUrl: string;
  apiKey: string;
}

const URL_KEY = 'partner-demo.baseUrl';
const API_KEY_KEY = 'partner-demo.apiKey';

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: import.meta.env.VITE_PARTNER_API_BASE_URL ?? 'http://127.0.0.1:4010',
  apiKey: import.meta.env.VITE_PARTNER_API_KEY ?? '',
};

/** Trim, drop trailing slashes, and forgive a pasted partner prefix. */
export function normaliseBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url.toLowerCase().endsWith(PARTNER_API_PREFIX)) url = url.slice(0, -PARTNER_API_PREFIX.length);
  return url;
}

/** The message that blocks saving, or null when the settings are usable. */
export function validateSettings(settings: Settings): string | null {
  if (!settings.baseUrl) return 'Enter the API base URL.';
  let url: URL;
  try {
    url = new URL(settings.baseUrl);
  } catch {
    return 'The base URL is not a valid URL.';
  }
  const environment = keyEnvironment(settings.apiKey);
  if (environment === 'invalid') return 'The key must look like hbk_test_… or hbk_live_….';
  if (environment === 'live') {
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' || local) return 'A live key may only be used over https against a production host. Use a test key here.';
  }
  return null;
}

/** The URL is remembered across sessions; the key only for this tab's session. Storage may be unavailable. */
export function loadSettings(): Settings {
  try {
    return {
      baseUrl: localStorage.getItem(URL_KEY) ?? DEFAULT_SETTINGS.baseUrl,
      apiKey: sessionStorage.getItem(API_KEY_KEY) ?? DEFAULT_SETTINGS.apiKey,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(URL_KEY, settings.baseUrl);
    sessionStorage.setItem(API_KEY_KEY, settings.apiKey);
  } catch {
    // Private mode or blocked storage: the settings live in memory for this page only.
  }
}
