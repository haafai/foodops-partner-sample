import { MissingIdempotencyKeyError, PartnerApiError, PartnerTimeoutError } from './errors';

export interface RetryOptions {
  /** Total attempts including the first. Default 3; anything below 1 counts as 1. */
  attempts?: number;
  /** First back-off in milliseconds; doubles each retry, with ±20% jitter. Default 500. */
  baseDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** A number in [0, 1) that picks the jitter. Default `Math.random`; inject it to make tests deterministic. */
  random?: () => number;
}

/** The longest a `Retry-After` header can make one wait. */
export const MAX_RETRY_AFTER_MS = 60_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry only what may succeed on a second try:
 * - a PartnerApiError with status 429 or 5xx (every other 4xx is the caller's problem and comes straight back);
 * - a PartnerTimeoutError (no answer within the client's `timeoutMs`);
 * - a TypeError, which is how fetch reports a network failure, except a MissingIdempotencyKeyError.
 * Everything else — a SyntaxError from a bad body, an AbortError from the caller's own signal, a RangeError,
 * anything unknown — is not a transport failure and is thrown at once.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof PartnerApiError) return error.status === 429 || error.status >= 500;
  if (error instanceof PartnerTimeoutError) return true;
  if (error instanceof MissingIdempotencyKeyError) return false;
  return error instanceof TypeError;
}

/**
 * How long to wait before the next attempt: the server's `Retry-After` (capped at 60 s) when it sent one,
 * else `baseDelayMs * 2^(attempt-1)` times a random factor between 0.8 and 1.2.
 */
export function delayFor(error: unknown, attempt: number, baseDelayMs: number, random: () => number = Math.random): number {
  if (error instanceof PartnerApiError && error.retryAfterSeconds !== undefined) {
    return Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const jitter = 0.8 + 0.4 * random();
  return Math.round(baseDelayMs * 2 ** (attempt - 1) * jitter);
}

/**
 * Wrap ONE request. For a create or cancel, mint the idempotency key outside this wrapper and pass the same
 * value inside `fn`, so every retry replays the same order instead of placing a new one.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) throw error;
      await sleep(delayFor(error, attempt, baseDelayMs, random));
    }
  }
  throw lastError;
}
