import type { ReceivedEventsPage, ReceiverSnapshot } from './types';

export type * from './types';

/**
 * Talks to the receiver's local control port. It uses fetch and nothing else, so the browser demo can import it.
 * Only this machine can reach that port; see `createControlHandler`.
 */
export class ReceiverControl {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(controlUrl: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.#baseUrl = controlUrl.trim().replace(/\/+$/, '');
    this.#fetch = fetchImpl;
  }

  /** True only when `/_receiver/state` answers 2xx in the receiver's shape. Never throws. */
  static async detect(controlUrl: string, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<boolean> {
    try {
      const response = await fetchImpl(`${controlUrl.trim().replace(/\/+$/, '')}/_receiver/state`);
      if (!response.ok) return false;
      const body = (await response.json()) as unknown;
      if (typeof body !== 'object' || body === null) return false;
      const { hasSecret, received } = body as Record<string, unknown>;
      return typeof hasSecret === 'boolean' && typeof received === 'number';
    } catch {
      return false;
    }
  }

  state(): Promise<ReceiverSnapshot> { return this.#send('GET', 'state'); }
  /** Events accepted after `after`; pass the `lastSeq` of the previous page to read only what is new. */
  events(after = 0): Promise<ReceivedEventsPage> { return this.#send('GET', `events?after=${encodeURIComponent(String(after))}`); }
  /** Hand over the secret a `PUT webhook` just returned. Deliveries are refused until this has happened. */
  setSecret(secret: string): Promise<void> { return this.#send('PUT', 'secret', { secret }); }
  clearSecret(): Promise<void> { return this.#send('DELETE', 'secret'); }
  clearEvents(): Promise<void> { return this.#send('DELETE', 'events'); }

  async #send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.#fetch(`${this.#baseUrl}/_receiver/${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The body of a refusal is a short code. The request body (which may hold the secret) is never echoed.
    if (!response.ok) throw new Error(`receiver ${method} /_receiver/${path.split('?')[0]} answered ${response.status}`);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
