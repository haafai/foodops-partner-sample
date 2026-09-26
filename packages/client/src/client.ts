import { MissingIdempotencyKeyError, PartnerTimeoutError, errorFromResponse } from './errors';
import type { CreatePartnerOrderRequest, PartnerMenu, PartnerOrder, PartnerOrderCreated, PartnerOutlet } from './types';

export const PARTNER_API_PREFIX = '/api/external/v1/partner';

export interface PartnerClientOptions {
  /** The host root, e.g. `https://api.example.com`. The client adds the partner prefix itself. */
  baseUrl: string;
  /** `hbk_test_…` or `hbk_live_…`. Sent only in the Authorization header. */
  apiKey: string;
  /** Inject a fetch for tests or for Node versions without a global one. */
  fetch?: typeof fetch;
  /** Give up on a request with no answer after this long and throw a PartnerTimeoutError. Default 15000. */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

export type MenuResult =
  | { modified: true; menu: PartnerMenu; etag: string }
  | { modified: false; etag: string };

interface SendInit {
  headers?: Record<string, string>;
  body?: unknown;
}

function requireIdempotencyKey(key: string): void {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new MissingIdempotencyKeyError();
  }
}

/** The five partner calls. Every non-2xx answer throws a PartnerApiError. */
export class PartnerClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: PartnerClientOptions) {
    let base = options.baseUrl.trim().replace(/\/+$/, '');
    if (base.toLowerCase().endsWith(PARTNER_API_PREFIX)) base = base.slice(0, -PARTNER_API_PREFIX.length);
    this.#baseUrl = base;
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  listOutlets(): Promise<PartnerOutlet[]> {
    return this.#json<PartnerOutlet[]>('GET', 'outlets');
  }

  /** Pass the ETag you last received; a 304 comes back as `{ modified: false }` and costs almost nothing. */
  async getMenu(outletId: string, options: { ifNoneMatch?: string } = {}): Promise<MenuResult> {
    const headers: Record<string, string> = {};
    if (options.ifNoneMatch) headers['If-None-Match'] = options.ifNoneMatch;
    const response = await this.#send('GET', `outlets/${encodeURIComponent(outletId)}/menu`, { headers });
    if (response.status === 304) return { modified: false, etag: options.ifNoneMatch ?? '' };
    if (!response.ok) throw await errorFromResponse(response);
    const menu = (await response.json()) as PartnerMenu;
    // ETags are quoted strings; when the header is missing, quote the menu version the same way.
    return { modified: true, menu, etag: response.headers.get('etag') ?? `"${menu.version}"` };
  }

  /** `idempotencyKey` is yours: mint it once per order and send the same value on every retry. */
  async createOrder(request: CreatePartnerOrderRequest, idempotencyKey: string): Promise<PartnerOrderCreated> {
    requireIdempotencyKey(idempotencyKey);
    return this.#json<PartnerOrderCreated>('POST', 'orders', { body: request, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  getOrder(orderId: string): Promise<PartnerOrder> {
    return this.#json<PartnerOrder>('GET', `orders/${encodeURIComponent(orderId)}`);
  }

  async cancelOrder(orderId: string, reason: string, idempotencyKey: string): Promise<PartnerOrder> {
    requireIdempotencyKey(idempotencyKey);
    return this.#json<PartnerOrder>('POST', `orders/${encodeURIComponent(orderId)}/cancel`, {
      body: { reason }, headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  async #send(method: string, path: string, init: SendInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.#apiKey}`);
    headers.set('Accept', 'application/json');
    let body: string | undefined;
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.body);
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    try {
      return await this.#fetch(`${this.#baseUrl}${PARTNER_API_PREFIX}/${path}`, { method, headers, body, signal: controller.signal });
    } catch (e) {
      if (timedOut) throw new PartnerTimeoutError(method, path, this.#timeoutMs);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async #json<T>(method: string, path: string, init: SendInit = {}): Promise<T> {
    const response = await this.#send(method, path, init);
    if (!response.ok) throw await errorFromResponse(response);
    return (await response.json()) as T;
  }
}
