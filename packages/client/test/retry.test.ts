import { describe, expect, it } from 'vitest';
import { MissingIdempotencyKeyError, PartnerApiError, PartnerTimeoutError } from '../src/errors';
import { MAX_RETRY_AFTER_MS, delayFor, isRetryable, withRetry } from '../src/retry';

function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => { delays.push(ms); } };
}

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const { delays, sleep } = recordingSleep();
    const result = await withRetry(async () => 'ok', { sleep });
    expect(result).toBe('ok');
    expect(delays).toEqual([]);
  });

  it('retries a network failure, a 503 and a 429, then succeeds', async () => {
    const { delays, sleep } = recordingSleep();
    const answers: Array<() => string> = [
      () => { throw new TypeError('fetch failed'); },
      () => { throw new PartnerApiError({ status: 503, code: 'auth_unavailable', message: 'down' }); },
      () => { throw new PartnerApiError({ status: 429, code: 'rate_limited', message: 'slow', retryAfterSeconds: 2 }); },
      () => 'created',
    ];
    const result = await withRetry(async () => answers.shift()!(), { attempts: 4, baseDelayMs: 100, sleep, random: () => 0.5 });
    expect(result).toBe('created');
    expect(delays).toEqual([100, 200, 2000]);
  });

  it('never retries a 4xx other than 429', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new PartnerApiError({ status: 409, code: 'duplicate_order', message: 'dup' }); }, { sleep }))
      .rejects.toMatchObject({ code: 'duplicate_order' });
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('gives up after the last attempt and rethrows the last error', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new PartnerApiError({ status: 500, code: 'http_500', message: 'boom' }); }, { attempts: 3, baseDelayMs: 10, sleep, random: () => 0.5 }))
      .rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(3);
    expect(delays).toEqual([10, 20]);
  });
});

describe('isRetryable / delayFor', () => {
  it('classifies errors', () => {
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryable(new PartnerApiError({ status: 429, code: 'rate_limited', message: '' }))).toBe(true);
    expect(isRetryable(new PartnerApiError({ status: 502, code: 'http_502', message: '' }))).toBe(true);
    expect(isRetryable(new PartnerApiError({ status: 400, code: 'invalid_request', message: '' }))).toBe(false);
    expect(isRetryable(new PartnerApiError({ status: 401, code: 'invalid_api_key', message: '' }))).toBe(false);
  });
  it('honours Retry-After, else backs off exponentially', () => {
    expect(delayFor(new PartnerApiError({ status: 429, code: 'rate_limited', message: '', retryAfterSeconds: 3 }), 1, 500)).toBe(3000);
    expect(delayFor(new TypeError('x'), 1, 500, () => 0.5)).toBe(500);
    expect(delayFor(new TypeError('x'), 3, 500, () => 0.5)).toBe(2000);
  });
});

describe('what is and is not a transport failure', () => {
  it('retries a PartnerTimeoutError', async () => {
    const { delays, sleep } = recordingSleep();
    const answers: Array<() => string> = [() => { throw new PartnerTimeoutError('GET', 'outlets', 50); }, () => 'ok'];
    expect(await withRetry(async () => answers.shift()!(), { baseDelayMs: 10, sleep, random: () => 0.5 })).toBe('ok');
    expect(delays).toEqual([10]);
  });

  it.each([
    ['a SyntaxError', new SyntaxError('Unexpected token < in JSON')],
    ['an AbortError from the caller\'s own signal', new DOMException('The operation was aborted.', 'AbortError')],
    ['a RangeError', new RangeError('bad')],
    ['a MissingIdempotencyKeyError', new MissingIdempotencyKeyError()],
    ['an unknown thrown value', 'boom'],
  ])('does not retry %s', async (_label, thrown) => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw thrown; }, { sleep })).rejects.toBe(thrown);
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it('classifies a plain TypeError (fetch\'s network failure) as retryable, its MissingIdempotencyKeyError subclass not', () => {
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true);
    expect(new MissingIdempotencyKeyError()).toBeInstanceOf(TypeError);
    expect(isRetryable(new MissingIdempotencyKeyError())).toBe(false);
    expect(isRetryable(new PartnerTimeoutError('POST', 'orders', 15000))).toBe(true);
  });
});

describe('back-off shape', () => {
  it('jitters the exponential delay between 0.8x and 1.2x', () => {
    expect(delayFor(new TypeError('x'), 1, 1000, () => 0)).toBe(800);
    expect(delayFor(new TypeError('x'), 1, 1000, () => 0.999999)).toBe(1200);
    expect(delayFor(new TypeError('x'), 2, 1000, () => 0.25)).toBe(1800);
    for (let i = 0; i < 50; i++) {
      const d = delayFor(new TypeError('x'), 3, 500);
      expect(d).toBeGreaterThanOrEqual(1600);
      expect(d).toBeLessThanOrEqual(2400);
    }
  });

  it('caps a Retry-After wait at 60 seconds', () => {
    expect(MAX_RETRY_AFTER_MS).toBe(60_000);
    expect(delayFor(new PartnerApiError({ status: 429, code: 'rate_limited', message: '', retryAfterSeconds: 3600 }), 1, 500)).toBe(60_000);
    expect(delayFor(new PartnerApiError({ status: 503, code: 'auth_unavailable', message: '', retryAfterSeconds: 60 }), 1, 500)).toBe(60_000);
  });

  it('treats attempts: 0 (or less) as one attempt', async () => {
    const { delays, sleep } = recordingSleep();
    let calls = 0;
    expect(await withRetry(async () => { calls++; return 'once'; }, { attempts: 0, sleep })).toBe('once');
    expect(calls).toBe(1);
    await expect(withRetry(async () => { calls++; throw new TypeError('fetch failed'); }, { attempts: -2, sleep })).rejects.toThrow('fetch failed');
    expect(calls).toBe(2);
    expect(delays).toEqual([]);
  });
});
