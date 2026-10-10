import type { Mode } from '../config/mode';

export interface WebhookSettings {
  /** The receiver's local control address. Only this machine can reach it. */
  receiverUrl: string;
  /** The address the restaurant's API posts events to: the receiver's webhook route as the internet sees it. */
  publicUrl: string;
}

const KEY = 'partner-demo.webhook';

/** What `npm run receiver` listens on. The public URL is only this local one against the mock. */
export const DEFAULT_WEBHOOK_SETTINGS: WebhookSettings = {
  receiverUrl: 'http://127.0.0.1:4021',
  publicUrl: 'http://127.0.0.1:4020/webhooks/foodops',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parse(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

/** Trim both, and drop trailing slashes from the control address (it is a base, not a route). */
export function normaliseWebhookSettings(settings: WebhookSettings): WebhookSettings {
  return { receiverUrl: settings.receiverUrl.trim().replace(/\/+$/, ''), publicUrl: settings.publicUrl.trim() };
}

/** The message that blocks registering, or null when the two addresses are usable in this mode. */
export function validateWebhookSettings(settings: WebhookSettings, mode: Mode | 'unknown'): string | null {
  const receiver = parse(settings.receiverUrl);
  if (!receiver || !LOCAL_HOSTS.has(receiver.hostname)) return 'The receiver control address must be on this machine, for example http://127.0.0.1:4021.';
  const target = parse(settings.publicUrl);
  if (!target || (target.protocol !== 'https:' && target.protocol !== 'http:')) return 'The webhook URL is not a valid URL.';
  // The mock accepts a local http address so the two can talk on one machine. A real API never does.
  if (mode !== 'mock' && (target.protocol !== 'https:' || LOCAL_HOSTS.has(target.hostname))) {
    return 'A restaurant only accepts an https URL on a public host. Put a tunnel in front of the receiver\'s webhook port and paste its https address here.';
  }
  return null;
}

/** The two addresses are remembered; the signing secret never is: it goes to the receiver and nowhere else. */
export function loadWebhookSettings(): WebhookSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === 'object' && parsed !== null) {
      const { receiverUrl, publicUrl } = parsed as Record<string, unknown>;
      if (typeof receiverUrl === 'string' && typeof publicUrl === 'string') return { receiverUrl, publicUrl };
    }
  } catch {
    // Unreadable storage: fall through to the defaults.
  }
  return DEFAULT_WEBHOOK_SETTINGS;
}

export function saveWebhookSettings(settings: WebhookSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the addresses live in memory for this page only.
  }
}
