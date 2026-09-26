import type { PartnerOrder } from '@foodops-partner/client';
import type { FaultResponse, MockStateSnapshot } from './snapshot';

/**
 * Drives the mock's simulated restaurant over HTTP. Only the mock answers these routes;
 * `detect` is how the demo and the runner learn whether they are talking to the mock.
 */
export class MockControl {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#fetch = fetchImpl;
  }

  /**
   * True only when `/_mock/state` answers 2xx with the mock's snapshot shape (an `outlets` array and an
   * `autopilot` object). A server that answers every path with 200 (an SPA fallback, a proxy page) is not the mock.
   */
  static async detect(baseUrl: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<boolean> {
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/_mock/state`);
      if (!response.ok) return false;
      const body = (await response.json()) as unknown;
      if (typeof body !== 'object' || body === null) return false;
      const { outlets, autopilot } = body as Record<string, unknown>;
      return Array.isArray(outlets) && typeof autopilot === 'object' && autopilot !== null && !Array.isArray(autopilot);
    } catch {
      return false;
    }
  }

  state(): Promise<MockStateSnapshot> { return this.#send('GET', 'state'); }
  reset(): Promise<void> { return this.#send('POST', 'reset'); }
  accept(orderId: string): Promise<PartnerOrder> { return this.#send('POST', `orders/${encodeURIComponent(orderId)}/accept`); }
  reject(orderId: string, reason: string): Promise<PartnerOrder> { return this.#send('POST', `orders/${encodeURIComponent(orderId)}/reject`, { reason }); }
  advance(orderId: string): Promise<PartnerOrder> { return this.#send('POST', `orders/${encodeURIComponent(orderId)}/advance`); }
  timeout(orderId: string): Promise<PartnerOrder> { return this.#send('POST', `orders/${encodeURIComponent(orderId)}/timeout`); }
  restaurantCancel(orderId: string, reason: string): Promise<PartnerOrder> { return this.#send('POST', `orders/${encodeURIComponent(orderId)}/restaurant-cancel`, { reason }); }
  setOutlet(outletId: string, flags: { open?: boolean; acceptingOnline?: boolean }): Promise<void> { return this.#send('PUT', `outlets/${encodeURIComponent(outletId)}`, flags); }
  setPrice(variantId: string, price: number): Promise<void> { return this.#send('PUT', 'prices', { variantId, price }); }
  queueFaults(responses: FaultResponse[]): Promise<void> { return this.#send('POST', 'faults', { responses }); }
  setAutopilot(enabled: boolean, stepSeconds = 5): Promise<void> { return this.#send('PUT', 'autopilot', { enabled, stepSeconds }); }

  async #send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/_mock/${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`mock control ${method} /_mock/${path} answered ${response.status}: ${await response.text()}`);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
