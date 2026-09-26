import { PartnerApiError } from './errors';

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** First back-off in milliseconds; doubles each retry. Default 500. */
  baseDelayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry only what may succeed on a second try: a transport failure (anything that is not an API answer),
 * a 429, or a 5xx. Every other 4xx is the caller's problem and comes straight back.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof PartnerApiError) return error.status === 429 || error.status >= 500;
  return true;
}

export function delayFor(error: unknown, attempt: number, baseDelayMs: number): number {
  if (error instanceof PartnerApiError && error.retryAfterSeconds !== undefined) return error.retryAfterSeconds * 1000;
  return baseDelayMs * 2 ** (attempt - 1);
}

/**
 * Wrap ONE request. For a create or cancel, mint the idempotency key outside this wrapper and pass the same
 * value inside `fn`, so every retry replays the same order instead of placing a new one.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) throw error;
      await sleep(delayFor(error, attempt, baseDelayMs));
    }
  }
  throw lastError;
}
