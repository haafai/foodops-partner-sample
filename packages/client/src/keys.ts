const KEY_PATTERN = /^hbk_(live|test)_([A-Za-z0-9]{12})_([A-Za-z0-9]+)$/;

/** Mint an idempotency key BEFORE the first attempt and reuse it on every retry of that same request. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** `test` keys only work outside production; `live` keys only in it. */
export function keyEnvironment(key: string): 'test' | 'live' | 'invalid' {
  const match = KEY_PATTERN.exec(key);
  return match ? (match[1] as 'test' | 'live') : 'invalid';
}

/** The only form of a key that may be shown or logged: environment and id, never the secret. */
export function redactKey(key: string): string {
  const match = KEY_PATTERN.exec(key);
  return match ? `hbk_${match[1]}_${match[2]}_…` : '…';
}
