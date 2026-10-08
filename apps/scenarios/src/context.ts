import { PARTNER_API_PREFIX, PartnerApiError, PartnerClient, canCancel, newIdempotencyKey, withRetry } from '@foodops-partner/client';
import type { CreatePartnerOrderLine, PartnerMenu, PartnerMenuVariant, PartnerModifierGroup, PartnerOutlet } from '@foodops-partner/client';
import { MOCK_KEYS } from '@foodops-partner/mock-server';
import { MockControl } from '@foodops-partner/mock-server/control-client';
import type { Capability, RawInit, ScenarioContext } from './scenario';

export interface ContextOptions {
  baseUrl: string;
  apiKey: string;
  closedOutletId?: string;
  menuOnlyKey?: string;
  unboundKey?: string;
  /** A public https URL that forwards to `webhookListenPort` on this machine (a tunnel). Not needed against the mock. */
  webhookUrl?: string;
  webhookListenPort?: number;
  fetchImpl?: typeof fetch;
  /** Injected for tests: the pause between contract requests against a real API, and cleanup's retry back-off. */
  sleep?: (ms: number) => Promise<void>;
}

/** The pause before each contract request the context makes against a real API, to stay under its rate limit. */
export const PACE_MS = 150;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The same normalisation the client applies: trim, drop trailing slashes and a pasted partner prefix. */
export function normaliseBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  if (base.toLowerCase().endsWith(PARTNER_API_PREFIX)) base = base.slice(0, -PARTNER_API_PREFIX.length);
  return base;
}

function describeFailure(error: unknown): string {
  if (error instanceof PartnerApiError) return `${error.status} ${error.code}`;
  return error instanceof Error ? error.message : String(error);
}

/** The first available variant on an item with no required modifier group: a line the API cannot refuse. */
export function simpleLine(menu: PartnerMenu): CreatePartnerOrderLine {
  for (const category of menu.categories) {
    for (const item of category.items) {
      if (item.modifierGroups.some((g) => g.min > 0)) continue;
      const variant = item.variants.find((v) => v.available);
      if (variant) return { variantId: variant.variantId, quantity: 1 };
    }
  }
  throw new Error('No item without required modifiers is available on this menu.');
}

export function unavailableVariant(menu: PartnerMenu): PartnerMenuVariant | undefined {
  return menu.categories.flatMap((c) => c.items).flatMap((i) => i.variants).find((v) => !v.available);
}

/** An available variant whose item has a modifier group with a ceiling, so "one too many" can be sent. */
export function groupWithMax(menu: PartnerMenu): { variant: PartnerMenuVariant; group: PartnerModifierGroup } | undefined {
  for (const item of menu.categories.flatMap((c) => c.items)) {
    const variant = item.variants.find((v) => v.available);
    const group = item.modifierGroups.find((g) => g.max >= 1 && g.modifiers.length > 0);
    if (variant && group) return { variant, group };
  }
  return undefined;
}

export async function createContext(options: ContextOptions): Promise<ScenarioContext> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? defaultSleep;
  const baseUrl = normaliseBaseUrl(options.baseUrl);
  const client = new PartnerClient({ baseUrl, apiKey: options.apiKey, fetch: fetchImpl });
  const mock = (await MockControl.detect(baseUrl, fetchImpl)) ? new MockControl(baseUrl, fetchImpl) : undefined;
  /** Against a real API, wait a little before each contract request; the mock has no rate limit to respect. */
  const pace = async (): Promise<void> => {
    if (!mock) await sleep(PACE_MS);
  };

  let closedOutletId = options.closedOutletId;
  let menuOnlyKey = options.menuOnlyKey;
  let unboundKey = options.unboundKey;
  if (mock) {
    const snapshot = await mock.state();
    closedOutletId ??= snapshot.outlets.find((o) => !o.open)?.outletId;
    menuOnlyKey ??= MOCK_KEYS.find((k) => k.partnerBound && !k.scopes.includes('orders.write'))?.key;
    unboundKey ??= MOCK_KEYS.find((k) => !k.partnerBound)?.key;
  }
  // The mock accepts a loopback URL, so against it a scenario can listen on any free port and register that.
  const webhookUrl = options.webhookUrl;
  const webhookListenPort = options.webhookListenPort ?? (mock ? 0 : undefined);
  const capabilities = new Set<Capability>();
  if (mock) capabilities.add('mock-control');
  if (closedOutletId) capabilities.add('closed-outlet');
  if (menuOnlyKey) capabilities.add('menu-only-key');
  if (unboundKey) capabilities.add('unbound-key');
  if (mock || webhookUrl) capabilities.add('webhook-url');
  if (webhookListenPort !== undefined && (mock || webhookUrl)) capabilities.add('webhook-listener');

  const tracked: string[] = [];
  let counter = 0;
  // One outlet list and one menu per outlet per run: every scenario needs them and the rate limit is per key.
  let outlets: Promise<PartnerOutlet[]> | undefined;
  const menus = new Map<string, Promise<PartnerMenu>>();

  return {
    client, baseUrl, apiKey: options.apiKey, fetchImpl, capabilities, mock, closedOutletId, menuOnlyKey, unboundKey, webhookUrl, webhookListenPort,
    async raw(method: string, path: string, init: RawInit = {}) {
      await pace();
      const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
      if (init.key !== null) headers.authorization = `Bearer ${init.key ?? options.apiKey}`;
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      return fetchImpl(`${baseUrl}${PARTNER_API_PREFIX}${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
    },
    reference(name: string) {
      counter += 1;
      return `SCN-${name}-${Date.now()}-${counter}`;
    },
    async pickOutlet() {
      outlets ??= pace().then(() => client.listOutlets());
      // A failed fetch is not cached: the next scenario asks again.
      const list = await outlets.catch((error: unknown) => {
        outlets = undefined;
        throw error;
      });
      const outlet = list.find((o) => o.acceptingOrders);
      if (!outlet) throw new Error('No outlet is accepting orders right now.');
      return outlet;
    },
    async pickMenu(outletId: string) {
      let menu = menus.get(outletId);
      if (!menu) {
        menu = pace().then(async () => {
          const result = await client.getMenu(outletId);
          if (!result.modified) throw new Error('The menu answered 304 to a request without If-None-Match.');
          return result.menu;
        });
        menus.set(outletId, menu);
      }
      return menu.catch((error: unknown) => {
        menus.delete(outletId);
        throw error;
      });
    },
    retryPaced<T>(request: () => Promise<T>) {
      return withRetry(async () => { await pace(); return request(); }, { attempts: 4, sleep });
    },
    track(orderId: string) {
      tracked.push(orderId);
    },
    async cleanup() {
      const retry = { attempts: 4, sleep };
      for (const orderId of tracked.splice(0)) {
        try {
          const order = await withRetry(async () => { await pace(); return client.getOrder(orderId); }, retry);
          if (!canCancel(order.status)) continue;
          // One key for every attempt, so a retried cancel replays instead of being judged twice.
          const key = newIdempotencyKey();
          await withRetry(async () => { await pace(); return client.cancelOrder(orderId, 'scenario cleanup', key); }, retry);
        } catch (error) {
          // Not the scenario's failure, but never silent: an order left pending is a real restaurant's problem.
          console.error(`cleanup: could not cancel order ${orderId} (${describeFailure(error)})`);
        }
      }
    },
  };
}
