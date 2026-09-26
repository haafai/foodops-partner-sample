import { PARTNER_API_PREFIX, PartnerClient, canCancel, newIdempotencyKey } from '@foodops-partner/client';
import type { CreatePartnerOrderLine, PartnerMenu, PartnerMenuVariant, PartnerModifierGroup } from '@foodops-partner/client';
import { MOCK_KEYS } from '@foodops-partner/mock-server';
import { MockControl } from '@foodops-partner/mock-server/control-client';
import type { Capability, RawInit, ScenarioContext } from './scenario';

export interface ContextOptions {
  baseUrl: string;
  apiKey: string;
  closedOutletId?: string;
  menuOnlyKey?: string;
  unboundKey?: string;
  fetchImpl?: typeof fetch;
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
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const client = new PartnerClient({ baseUrl, apiKey: options.apiKey, fetch: fetchImpl });
  const mock = (await MockControl.detect(baseUrl, fetchImpl)) ? new MockControl(baseUrl, fetchImpl) : undefined;

  let closedOutletId = options.closedOutletId;
  let menuOnlyKey = options.menuOnlyKey;
  let unboundKey = options.unboundKey;
  if (mock) {
    const snapshot = await mock.state();
    closedOutletId ??= snapshot.outlets.find((o) => !o.open)?.outletId;
    menuOnlyKey ??= MOCK_KEYS.find((k) => k.partnerBound && !k.scopes.includes('orders.write'))?.key;
    unboundKey ??= MOCK_KEYS.find((k) => !k.partnerBound)?.key;
  }
  const capabilities = new Set<Capability>();
  if (mock) capabilities.add('mock-control');
  if (closedOutletId) capabilities.add('closed-outlet');
  if (menuOnlyKey) capabilities.add('menu-only-key');
  if (unboundKey) capabilities.add('unbound-key');

  const tracked: string[] = [];
  let counter = 0;

  return {
    client, baseUrl, apiKey: options.apiKey, fetchImpl, capabilities, mock, closedOutletId, menuOnlyKey, unboundKey,
    raw(method: string, path: string, init: RawInit = {}) {
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
      const outlets = await client.listOutlets();
      const outlet = outlets.find((o) => o.acceptingOrders);
      if (!outlet) throw new Error('No outlet is accepting orders right now.');
      return outlet;
    },
    async pickMenu(outletId: string) {
      const result = await client.getMenu(outletId);
      if (!result.modified) throw new Error('The menu answered 304 to a request without If-None-Match.');
      return result.menu;
    },
    track(orderId: string) {
      tracked.push(orderId);
    },
    async cleanup() {
      for (const orderId of tracked.splice(0)) {
        try {
          const order = await client.getOrder(orderId);
          if (canCancel(order.status)) await client.cancelOrder(orderId, 'scenario cleanup', newIdempotencyKey());
        } catch {
          // Best effort: a refused or vanished order is not the scenario's failure.
        }
      }
    },
  };
}
