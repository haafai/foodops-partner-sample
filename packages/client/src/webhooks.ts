import type { PartnerOrderStatus } from './status';

// The header names and the signing rule are copied from the contract. Nothing here needs a dependency:
// the HMAC is Web Crypto, which Node 22, browsers and edge runtimes all provide as `crypto.subtle`.

export const WEBHOOK_SIGNATURE_HEADER = 'Hubits-Signature';
export const WEBHOOK_EVENT_ID_HEADER = 'Hubits-Event-Id';
export const WEBHOOK_EVENT_TYPE_HEADER = 'Hubits-Event-Type';
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
/** Reject a signature whose timestamp is further than this from now, in either direction. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export const ORDER_EVENT_TYPES = ['order.accepted', 'order.preparing', 'order.ready', 'order.picked_up', 'order.rejected', 'order.cancelled'] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];
export const MENU_EVENT_TYPE = 'menu.updated';

/** What every event carries. `type` is a string, not a union: a newer API may send types this code predates. */
export interface WebhookEnvelope {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface OrderEventData {
  orderId: string;
  partnerReference: string;
  outletId: string;
  status: PartnerOrderStatus;
  /** Present on `order.rejected` and `order.cancelled`. */
  reason?: string | null;
  /** Present on `order.cancelled`. */
  cancelledBy?: 'partner' | 'restaurant' | null;
}
export interface MenuEventData { outletId: string; version: string }

export interface OrderEvent extends WebhookEnvelope { type: OrderEventType; data: Record<string, unknown> & OrderEventData }
export interface MenuEvent extends WebhookEnvelope { type: typeof MENU_EVENT_TYPE; data: Record<string, unknown> & MenuEventData }

export type WebhookRejection = 'missing_header' | 'malformed_header' | 'bad_secret' | 'timestamp_out_of_tolerance' | 'signature_mismatch';
export type WebhookVerification = { ok: true; timestamp: number } | { ok: false; reason: WebhookRejection };

export interface ParsedSignature { timestamp: number; signatures: Uint8Array[] }

const HEX_64 = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * `t=<unix seconds>,v1=<64 lowercase hex>`. Pairs may come in any order; unknown names are ignored so a
 * later scheme (`v2=`) can be added beside `v1`. Null when there is no usable `t` or no well-formed `v1`.
 */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header) return null;
  let timestamp: number | undefined;
  const signatures: Uint8Array[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === 't' && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (name === 'v1' && HEX_64.test(value)) signatures.push(hexToBytes(value));
  }
  if (timestamp === undefined || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** The 32 key bytes inside `whsec_<base64url>`, or null when the secret is not one. */
export function decodeWebhookSecret(secret: string): Uint8Array | null {
  if (!secret.startsWith(WEBHOOK_SECRET_PREFIX)) return null;
  const encoded = secret.slice(WEBHOOK_SECRET_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  let binary: string;
  try {
    binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  if (binary.length !== 32) return null;
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const toBytes = (body: Uint8Array | string): Uint8Array => (typeof body === 'string' ? encoder.encode(body) : body);

/** The signed bytes: the timestamp, a dot, then the body exactly as it travelled. */
function signedPayload(timestamp: number, rawBody: Uint8Array): Uint8Array {
  const prefix = encoder.encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.length + rawBody.length);
  payload.set(prefix, 0);
  payload.set(rawBody, prefix.length);
  return payload;
}

function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** The `Hubits-Signature` value for a body. The mock uses it to sign; your tests can use it to forge a delivery. */
export async function signWebhookPayload(secret: string, timestamp: number, rawBody: Uint8Array | string): Promise<string> {
  const keyBytes = decodeWebhookSecret(secret);
  if (!keyBytes) throw new TypeError('The webhook secret must be whsec_ followed by 32 bytes in base64url.');
  const mac = await crypto.subtle.sign('HMAC', await importKey(keyBytes), signedPayload(timestamp, toBytes(rawBody)));
  return `t=${timestamp},v1=${bytesToHex(new Uint8Array(mac))}`;
}

export interface VerifyWebhookInput {
  /** The `whsec_…` value the last `PUT webhook` returned. */
  secret: string;
  /** The `Hubits-Signature` header, as received. */
  header: string | null | undefined;
  /** The request body EXACTLY as received, before any JSON parsing. Bytes are safest; a string is encoded as UTF-8. */
  rawBody: Uint8Array | string;
  /** Unix seconds. Injected for tests. */
  now?: number;
  toleranceSeconds?: number;
}

/**
 * Verify a delivery before trusting a byte of it.
 * - The body is verified as raw bytes. Parsing the JSON and serialising it again changes the bytes and fails.
 * - The comparison is `crypto.subtle.verify`, which is constant-time: never compare signatures with `===`.
 * - A timestamp more than five minutes from now is refused, so a captured delivery cannot be replayed later.
 */
export async function verifyWebhookSignature(input: VerifyWebhookInput): Promise<WebhookVerification> {
  if (!input.header) return { ok: false, reason: 'missing_header' };
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return { ok: false, reason: 'malformed_header' };
  const keyBytes = decodeWebhookSecret(input.secret);
  if (!keyBytes) return { ok: false, reason: 'bad_secret' };
  const key = await importKey(keyBytes);
  const payload = signedPayload(parsed.timestamp, toBytes(input.rawBody));
  let matched = false;
  // Every candidate is checked, with no early exit, so the time taken does not say which one matched.
  for (const signature of parsed.signatures) {
    if (await crypto.subtle.verify('HMAC', key, signature, payload)) matched = true;
  }
  if (!matched) return { ok: false, reason: 'signature_mismatch' };
  // The timestamp is inside the signed bytes, so it is only trusted once the signature has matched.
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - parsed.timestamp) > tolerance) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  return { ok: true, timestamp: parsed.timestamp };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** The envelope of a VERIFIED body, or null when it is not one. Call this only after `verifyWebhookSignature`. */
export function parseWebhookEnvelope(rawBody: Uint8Array | string): WebhookEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(typeof rawBody === 'string' ? rawBody : new TextDecoder('utf-8', { fatal: true }).decode(rawBody));
  } catch {
    return null;
  }
  if (!isObj(value) || !isText(value.id) || !isText(value.type) || !isText(value.createdAt) || !isObj(value.data)) return null;
  if (Number.isNaN(Date.parse(value.createdAt))) return null;
  return { id: value.id, type: value.type, createdAt: value.createdAt, data: value.data };
}

export function isOrderEvent(event: WebhookEnvelope): event is OrderEvent {
  return (ORDER_EVENT_TYPES as readonly string[]).includes(event.type)
    && isText(event.data.orderId) && isText(event.data.outletId) && isText(event.data.status)
    && typeof event.data.partnerReference === 'string'
    && event.type === `order.${event.data.status}`;
}

export function isMenuEvent(event: WebhookEnvelope): event is MenuEvent {
  return event.type === MENU_EVENT_TYPE && isText(event.data.outletId) && isText(event.data.version);
}
