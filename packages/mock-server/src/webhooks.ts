import { randomBytes } from 'node:crypto';
import {
  WEBHOOK_EVENT_ID_HEADER, WEBHOOK_EVENT_TYPE_HEADER, WEBHOOK_SECRET_PREFIX, WEBHOOK_SIGNATURE_HEADER, signWebhookPayload,
} from '@foodops-partner/client';
import type { PartnerWebhook, PartnerWebhookEventName, PartnerWebhookOutcome, PartnerWebhookRegistration } from '@foodops-partner/client';
import { OUTLETS } from './fixtures';
import type { MockKey } from './fixtures';
import { empty, error, json } from './http';
import type { JsonResponse } from './http';
import { buildMenu } from './menu';
import type { MockState, StoredOrder, StoredWebhook } from './state';

export const MAX_WEBHOOK_URL_LENGTH = 2000;
/** One attempt, and this long for all of it. */
export const WEBHOOK_TIMEOUT_MS = 5000;
export const WEBHOOK_USER_AGENT = 'Hubits-Webhooks/1';

const EVENT_ORDER: readonly PartnerWebhookEventName[] = ['order', 'menu'];
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A literal address the real API would refuse without asking DNS: private, link-local, shared, reserved. */
function isBlockedLiteral(hostname: string): boolean {
  if (hostname.startsWith('[')) {
    const address = hostname.slice(1, -1).toLowerCase();
    return address === '::' || address === '::1' || address.startsWith('::ffff:') || /^(f[cd]|fe[89ab])/.test(address);
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * The contract's URL rules, with ONE deliberate difference: this mock accepts a loopback host over http on any
 * port, so the receiver on your own machine can be registered. The real API refuses that URL. The mock does not
 * resolve names, so it only catches a private address written as a literal.
 */
export function validateWebhookUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input === '' || input.length > MAX_WEBHOOK_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '') return null;
  if (LOOPBACK_HOSTS.has(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:' ? input : null;
  // `URL` drops a default port, so an explicit :443 reads as '' here too.
  if (url.protocol !== 'https:' || url.port !== '') return null;
  if (isBlockedLiteral(url.hostname)) return null;
  return input;
}

/** Absent means both. Present must be a non-empty list of known names; the answer is always in contract order. */
export function parseWebhookEvents(input: unknown): PartnerWebhookEventName[] | null {
  if (input === undefined || input === null) return [...EVENT_ORDER];
  if (!Array.isArray(input) || input.length === 0) return null;
  if (!input.every((name) => name === 'order' || name === 'menu')) return null;
  return EVENT_ORDER.filter((name) => input.includes(name));
}

export const newWebhookSecret = (): string => `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `evt_` plus a ULID: 48 bits of milliseconds then 80 random bits, 26 Crockford base-32 characters. */
export function newEventId(nowMs: number, random: Uint8Array = randomBytes(10)): string {
  let time = '';
  let rest = Math.floor(nowMs);
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  let bits = 0n;
  for (const byte of random) bits = (bits << 8n) | BigInt(byte);
  let tail = '';
  for (let i = 0; i < 16; i++) {
    tail = CROCKFORD[Number(bits & 31n)] + tail;
    bits >>= 5n;
  }
  return `evt_${time}${tail}`;
}

export function toWebhookDto(hook: StoredWebhook): PartnerWebhook {
  return {
    url: hook.url, events: [...hook.events],
    createdAt: new Date(hook.createdAt).toISOString(), updatedAt: new Date(hook.updatedAt).toISOString(),
    lastDelivery: hook.lastDelivery
      ? { at: new Date(hook.lastDelivery.at).toISOString(), httpStatus: hook.lastDelivery.httpStatus, outcome: hook.lastDelivery.outcome }
      : null,
    consecutiveFailures: hook.consecutiveFailures,
  };
}

function currentMenuVersions(state: MockState): Map<string, string> {
  const versions = new Map<string, string>();
  for (const outlet of OUTLETS) {
    const version = buildMenu(state, outlet.outletId)?.version;
    if (version) versions.set(outlet.outletId, version);
  }
  return versions;
}

/** Set or replace. Every call issues a new secret; the present is marked as already announced. */
export function handlePutWebhook(state: MockState, key: MockKey, body: unknown): JsonResponse {
  if (!isObj(body)) return error(400, 'invalid_request', 'The body must be a JSON object with a url.', { field: 'body' });
  const url = validateWebhookUrl(body.url);
  if (!url) return error(400, 'invalid_webhook_url', 'The url must be https on a public host, port 443, at most 2000 characters, with no user or password.');
  const events = parseWebhookEvents(body.events);
  if (!events) return error(400, 'invalid_events', 'events must be a non-empty list of "order" and "menu", or be left out for both.');
  const now = state.clock();
  const previous = state.webhooks.get(key.keyId);
  const hook: StoredWebhook = {
    url, events, secret: newWebhookSecret(),
    createdAt: previous?.createdAt ?? now, updatedAt: now,
    lastDelivery: previous?.lastDelivery ?? null, consecutiveFailures: previous?.consecutiveFailures ?? 0,
    menuVersions: currentMenuVersions(state),
  };
  state.webhooks.set(key.keyId, hook);
  const registration: PartnerWebhookRegistration = { ...toWebhookDto(hook), secret: hook.secret };
  return json(200, registration);
}

export function handleGetWebhook(state: MockState, key: MockKey): JsonResponse {
  const hook = state.webhooks.get(key.keyId);
  return hook ? json(200, toWebhookDto(hook)) : error(404, 'not_found', 'No webhook is set for this key.');
}

export function handleDeleteWebhook(state: MockState, key: MockKey): JsonResponse {
  state.webhooks.delete(key.keyId);
  return empty(204);
}

async function deliver(state: MockState, hook: StoredWebhook, type: string, data: Record<string, unknown>): Promise<void> {
  const now = state.clock();
  const id = newEventId(now);
  const body = JSON.stringify({ id, type, createdAt: new Date(now).toISOString(), data });
  let httpStatus: number | null = null;
  let outcome: PartnerWebhookOutcome;
  try {
    const signature = await signWebhookPayload(hook.secret, Math.floor(now / 1000), body);
    const response = await state.webhookFetch(hook.url, {
      method: 'POST',
      // A redirect is an answer, not an instruction: it is recorded as a failure and never followed.
      redirect: 'manual',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json', 'user-agent': WEBHOOK_USER_AGENT,
        [WEBHOOK_EVENT_ID_HEADER]: id, [WEBHOOK_EVENT_TYPE_HEADER]: type, [WEBHOOK_SIGNATURE_HEADER]: signature,
      },
      body,
    });
    httpStatus = response.status;
    outcome = response.status >= 200 && response.status < 300 ? 'delivered' : 'http_error';
    await response.body?.cancel();
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    outcome = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'connection_failed';
  }
  hook.lastDelivery = { at: state.clock(), httpStatus, outcome };
  hook.consecutiveFailures = outcome === 'delivered' ? 0 : hook.consecutiveFailures + 1;
}

/** One attempt, in the background: the caller (a status change, a price change) never waits for the partner. */
function send(state: MockState, hook: StoredWebhook, type: string, data: Record<string, unknown>): void {
  const delivery: Promise<void> = deliver(state, hook, type, data).finally(() => { state.deliveries.delete(delivery); });
  state.deliveries.add(delivery);
}

/** Called after every status change. `pending` is never announced: the partner created the order and has it. */
export function announceOrder(state: MockState, order: StoredOrder): void {
  if (order.status === 'pending') return;
  const hook = state.webhooks.get(order.keyId);
  if (!hook || !hook.events.includes('order')) return;
  const data: Record<string, unknown> = { orderId: order.id, partnerReference: order.partnerReference, outletId: order.outletId, status: order.status };
  if (order.status === 'rejected' || order.status === 'cancelled') data.reason = order.reason;
  if (order.status === 'cancelled') data.cancelledBy = order.cancelledBy;
  send(state, hook, `order.${order.status}`, data);
}

/** Called after anything that may change a menu. Sends only for an outlet whose version really changed. */
export function announceMenus(state: MockState): void {
  for (const hook of state.webhooks.values()) {
    if (!hook.events.includes('menu')) continue;
    for (const [outletId, version] of currentMenuVersions(state)) {
      if (hook.menuVersions.get(outletId) === version) continue;
      hook.menuVersions.set(outletId, version);
      send(state, hook, 'menu.updated', { outletId, version });
    }
  }
}
