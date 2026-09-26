import { newIdempotencyKey } from '@foodops-partner/client';

export interface KeyedRequest {
  key: string;
  fingerprint: string;
}

/** The same request keeps its key so a retry replays the same order; a changed request gets a fresh one. */
export function keyFor(current: KeyedRequest | null, fingerprint: string): KeyedRequest {
  if (current && current.fingerprint === fingerprint) return current;
  return { key: newIdempotencyKey(), fingerprint };
}
