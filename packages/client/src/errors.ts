/** Every code the partner API can answer with. Unknown codes still pass through unchanged. */
export const PARTNER_ERROR_CODES = [
  'invalid_request', 'idempotency_key_required', 'invalid_api_key', 'quota_exceeded', 'partner_key_required',
  'endpoint_not_available', 'insufficient_scope', 'ip_not_allowed', 'not_found', 'duplicate_order', 'outlet_closed',
  'cannot_cancel', 'idempotency_conflict', 'outlet_not_accepting', 'outlet_not_configured', 'invalid_line',
  'rate_limited', 'auth_unavailable',
] as const;

export type PartnerErrorCode = (typeof PARTNER_ERROR_CODES)[number];

export interface PartnerApiErrorInit {
  status: number;
  code: PartnerErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

/** One error type for every non-2xx answer. Branch on `code`. The API key is never inside it. */
export class PartnerApiError extends Error {
  readonly status: number;
  readonly code: PartnerErrorCode | string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(init: PartnerApiErrorInit) {
    super(init.message);
    this.name = 'PartnerApiError';
    this.status = init.status;
    this.code = init.code;
    if (init.details !== undefined) this.details = init.details;
    if (init.retryAfterSeconds !== undefined) this.retryAfterSeconds = init.retryAfterSeconds;
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { name: this.name, status: this.status, code: this.code, message: this.message };
    if (this.details !== undefined) out.details = this.details;
    if (this.retryAfterSeconds !== undefined) out.retryAfterSeconds = this.retryAfterSeconds;
    return out;
  }
}

function isErrorBody(value: unknown): value is { error: string; message: string } & Record<string, unknown> {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).error === 'string'
    && typeof (value as Record<string, unknown>).message === 'string';
}

/** Whole seconds to wait, from a `Retry-After` header in either delta-seconds or HTTP-date form. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isInteger(seconds) && seconds >= 0) return seconds;
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** Build the error for a non-2xx response. Reads the body once; tolerates a non-JSON body. */
export async function errorFromResponse(response: Response, now: number = Date.now()): Promise<PartnerApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'), now);
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (isErrorBody(body)) {
    const { error, message, ...rest } = body;
    return new PartnerApiError({
      status: response.status, code: error, message,
      details: Object.keys(rest).length > 0 ? rest : undefined,
      retryAfterSeconds,
    });
  }
  return new PartnerApiError({
    status: response.status, code: `http_${response.status}`,
    message: response.statusText || `HTTP ${response.status}`,
    retryAfterSeconds,
  });
}

/**
 * A request that got no answer within the client's `timeoutMs`. It carries the method and the relative path
 * only: never the key, never the base URL. `withRetry` retries it.
 */
export class PartnerTimeoutError extends Error {
  readonly method: string;
  readonly path: string;
  readonly timeoutMs: number;

  constructor(method: string, path: string, timeoutMs: number) {
    super(`${method} ${path} timed out after ${timeoutMs} ms`);
    this.name = 'PartnerTimeoutError';
    this.method = method;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }
}

/** A create or cancel called without an idempotency key. A programming error: `withRetry` never retries it. */
export class MissingIdempotencyKeyError extends TypeError {
  constructor() {
    super('An idempotency key is required. Mint it with newIdempotencyKey() before the first attempt and reuse it on retries.');
    this.name = 'MissingIdempotencyKeyError';
  }
}
