import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WEBHOOK_SIGNATURE_HEADER, decodeWebhookSecret, parseWebhookEnvelope, verifyWebhookSignature } from '@foodops-partner/client';
import { ReceiverState } from './store';
import type { ReceivedEventsPage } from './types';

export const WEBHOOK_PATH = '/webhooks/foodops';
export const CONTROL_PREFIX = '/_receiver/';
/** An event is a few hundred bytes. Anything near this size is not one. */
export const MAX_BODY_BYTES = 64 * 1024;
/** The pages allowed to drive the control port from a browser: the demo's two local addresses. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['http://localhost:5180', 'http://127.0.0.1:5180'];

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
const headerValue = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

function reply(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

/** The body as the bytes that arrived, or null when it is larger than `limit`. Never parsed here. */
function readRaw(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total <= limit) chunks.push(chunk);
      else chunks.length = 0;
    });
    req.on('end', () => resolve(total > limit ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * The public side: one route, `POST /webhooks/foodops`. This is the handler to copy.
 * 1. Read the raw bytes. 2. Verify the signature over those bytes. 3. Only then parse.
 * 4. Skip an id already seen. 5. Record and answer 200 at once: the sender waits five seconds and tries once,
 *    so anything slow (a database write, a push to a customer) belongs after the answer, on your own queue.
 */
export function createWebhookHandler(state: ReceiverState): Handler {
  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://receiver.local');
      if (url.pathname !== WEBHOOK_PATH) return reply(res, 404, { error: 'not_found' });
      if (req.method !== 'POST') return reply(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      const raw = await readRaw(req, MAX_BODY_BYTES);
      if (!raw) return reply(res, 413, { error: 'payload_too_large' }, { connection: 'close' });
      if (!state.secret) {
        state.reject('no_secret');
        return reply(res, 401, { error: 'invalid_signature' });
      }
      const verdict = await verifyWebhookSignature({
        secret: state.secret, header: headerValue(req.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()]), rawBody: raw,
        now: Math.floor(state.clock() / 1000),
      });
      if (!verdict.ok) {
        // The answer never says why: a forger learns nothing. The reason is kept for the operator.
        state.reject(verdict.reason);
        return reply(res, 401, { error: 'invalid_signature' });
      }
      const event = parseWebhookEnvelope(raw);
      if (!event) return reply(res, 400, { error: 'invalid_event' });
      const outcome = state.record(event);
      return reply(res, 200, outcome === 'duplicate' ? { received: true, duplicate: true } : { received: true });
    } catch {
      reply(res, 500, { error: 'receiver_failure' });
    }
  };
}

export interface ControlOptions { allowedOrigins: readonly string[]; webhookUrl: string }

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The private side: how this machine hands the receiver its secret and reads what arrived. It has no
 * authentication, so it lives on its own port, which is never the one you expose to the internet, and it
 * refuses a request that was not addressed to a loopback name or that comes from a page it does not know.
 */
export function createControlHandler(state: ReceiverState, options: ControlOptions): Handler {
  return async (req, res) => {
    try {
      if (!LOOPBACK_HOST.test(req.headers.host ?? '')) return reply(res, 403, { error: 'host_not_allowed' });
      const origin = headerValue(req.headers.origin);
      const cors: Record<string, string> = {};
      if (origin !== undefined) {
        if (!options.allowedOrigins.includes(origin)) return reply(res, 403, { error: 'origin_not_allowed' });
        cors['access-control-allow-origin'] = origin;
        cors.vary = 'Origin';
        cors['access-control-allow-methods'] = 'GET, PUT, DELETE, OPTIONS';
        cors['access-control-allow-headers'] = 'Content-Type';
        cors['access-control-max-age'] = '600';
      }
      const method = (req.method ?? 'GET').toUpperCase();
      if (method === 'OPTIONS') return reply(res, 204, undefined, cors);
      const url = new URL(req.url ?? '/', 'http://receiver.local');
      if (!url.pathname.startsWith(CONTROL_PREFIX)) return reply(res, 404, { error: 'not_found' }, cors);
      const path = url.pathname.slice(CONTROL_PREFIX.length);

      if (method === 'GET' && path === 'state') return reply(res, 200, state.snapshot(options.webhookUrl), cors);
      if (method === 'GET' && path === 'events') {
        const after = Number(url.searchParams.get('after') ?? '0');
        const page: ReceivedEventsPage = { events: state.eventsAfter(Number.isFinite(after) ? after : 0), lastSeq: state.lastSeq, hasSecret: state.secret !== null, bootId: state.bootId };
        return reply(res, 200, page, cors);
      }
      if (method === 'PUT' && path === 'secret') {
        const raw = await readRaw(req, MAX_BODY_BYTES);
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw.toString('utf8')) : undefined;
        } catch {
          body = undefined;
        }
        const secret = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).secret : undefined;
        if (typeof secret !== 'string' || !decodeWebhookSecret(secret)) return reply(res, 400, { error: 'invalid_secret' }, cors);
        state.secret = secret;
        return reply(res, 204, undefined, cors);
      }
      if (method === 'DELETE' && path === 'secret') {
        state.secret = null;
        return reply(res, 204, undefined, cors);
      }
      if (method === 'DELETE' && path === 'events') {
        state.clearEvents();
        return reply(res, 204, undefined, cors);
      }
      return reply(res, 404, { error: 'not_found' }, cors);
    } catch {
      reply(res, 500, { error: 'receiver_failure' });
    }
  };
}

export interface ReceiverOptions {
  /** Where deliveries arrive. 0 (the default) picks a free port, which is what tests want. */
  webhookPort?: number;
  /** The local control port. 0 picks a free one. */
  controlPort?: number;
  /** Both listeners bind here. Keep it loopback and put a tunnel or a reverse proxy in front of the webhook port. */
  host?: string;
  secret?: string | null;
  allowedOrigins?: readonly string[];
  clock?: () => number;
}

export interface ReceiverHandle {
  /** The local address of the delivery route, path included. */
  webhookUrl: string;
  controlUrl: string;
  webhookPort: number;
  controlPort: number;
  state: ReceiverState;
  close(): Promise<void>;
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

const stop = (server: Server): Promise<void> => new Promise((resolve) => {
  server.closeAllConnections();
  server.close(() => resolve());
});

/** Two listeners in one process: the delivery route on one port, the local control routes on another. */
export async function startReceiver(options: ReceiverOptions = {}): Promise<ReceiverHandle> {
  const host = options.host ?? '127.0.0.1';
  const state = new ReceiverState({ secret: options.secret, clock: options.clock });
  const webhookServer = createServer(createWebhookHandler(state));
  // A sender that stalls mid-body is cut off rather than held open.
  webhookServer.requestTimeout = 10_000;
  const webhookPort = await listen(webhookServer, options.webhookPort ?? 0, host);
  const webhookUrl = `http://${host}:${webhookPort}${WEBHOOK_PATH}`;
  const controlServer = createServer(createControlHandler(state, { allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS, webhookUrl }));
  let controlPort: number;
  try {
    controlPort = await listen(controlServer, options.controlPort ?? 0, host);
  } catch (e) {
    await stop(webhookServer);
    throw e;
  }
  return {
    webhookUrl, controlUrl: `http://${host}:${controlPort}`, webhookPort, controlPort, state,
    close: async () => {
      await Promise.all([stop(webhookServer), stop(controlServer)]);
    },
  };
}
