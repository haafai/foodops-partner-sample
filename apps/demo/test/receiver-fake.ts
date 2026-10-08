import type { WebhookEnvelope } from '@foodops-partner/client';
import type { ReceivedEvent, ReceiverSnapshot } from '@foodops-partner/webhook-receiver/control-client';

export interface FakeReceiver {
  fetch: typeof fetch;
  calls: Array<{ method: string; path: string; body?: unknown }>;
  /** The `after` value of every events read, in order. */
  afters: number[];
  /** What the receiver was handed. Tests read it to prove the secret went here and nowhere else. */
  secret: string | null;
  events: ReceivedEvent[];
  rejected: number;
  /** True: every call fails the way fetch does when nothing is listening. */
  down: boolean;
  /** True: `PUT secret` answers 400. */
  refuseSecret: boolean;
  /** Changes when the receiver is restarted, as the real one's does. */
  bootId: string;
  push(event: WebhookEnvelope): void;
  /** What a restart with the secret in its environment does: the events are gone and seq begins at 1 again. */
  restart(): void;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Stands in for the receiver's control port. Any call to another address fails the test loudly. */
export function fakeReceiver(base = 'http://127.0.0.1:4021'): FakeReceiver {
  const receiver: FakeReceiver = {
    calls: [], afters: [], secret: null, events: [], rejected: 0, down: false, refuseSecret: false, bootId: 'boot-1',
    restart() {
      receiver.events.length = 0;
      receiver.bootId = `boot-${Number(receiver.bootId.slice(5)) + 1}`;
    },
    push(event) {
      receiver.events.push({ seq: receiver.events.length + 1, receivedAt: new Date().toISOString(), event });
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(`${base}/_receiver/`)) throw new Error(`unexpected fetch to ${url}`);
      if (receiver.down) throw new TypeError('fetch failed');
      const method = (init?.method ?? 'GET').toUpperCase();
      const { pathname, searchParams } = new URL(url);
      const path = pathname.slice('/_receiver/'.length);
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      receiver.calls.push({ method, path, body });
      if (method === 'GET' && path === 'state') {
        const snapshot: ReceiverSnapshot = {
          hasSecret: receiver.secret !== null, received: receiver.events.length, duplicates: 0, rejected: receiver.rejected,
          lastReceivedAt: null, lastRejection: receiver.rejected > 0 ? { at: '2026-10-08T09:12:44.000Z', reason: 'signature_mismatch' } : null,
          webhookUrl: 'http://127.0.0.1:4020/webhooks/foodops',
        };
        return json(200, snapshot);
      }
      if (method === 'GET' && path === 'events') {
        const after = Number(searchParams.get('after') ?? '0');
        receiver.afters.push(after);
        return json(200, { events: receiver.events.filter((e) => e.seq > after), lastSeq: receiver.events.length, hasSecret: receiver.secret !== null, bootId: receiver.bootId });
      }
      if (method === 'PUT' && path === 'secret') {
        if (receiver.refuseSecret) return json(400, { error: 'invalid_secret' });
        receiver.secret = (body as { secret: string }).secret;
        return new Response(null, { status: 204 });
      }
      if (method === 'DELETE' && path === 'secret') {
        receiver.secret = null;
        return new Response(null, { status: 204 });
      }
      return json(404, { error: 'not_found' });
    }) as typeof fetch,
  };
  return receiver;
}
