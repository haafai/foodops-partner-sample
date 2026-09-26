import { describe, expect, it } from 'vitest';
import { PartnerApiError } from '../src/errors';
import { delayFor, isRetryable, withRetry } from '../src/retry';

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
    const result = await withRetry(async () => answers.shift()!(), { attempts: 4, baseDelayMs: 100, sleep });
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
    await expect(withRetry(async () => { calls++; throw new PartnerApiError({ status: 500, code: 'http_500', message: 'boom' }); }, { attempts: 3, baseDelayMs: 10, sleep }))
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
    expect(delayFor(new TypeError('x'), 1, 500)).toBe(500);
    expect(delayFor(new TypeError('x'), 3, 500)).toBe(2000);
  });
});
