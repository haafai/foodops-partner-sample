import { describe, expect, it } from 'vitest';
import { keyEnvironment, newIdempotencyKey, redactKey } from '../src/keys';

describe('keys', () => {
  it('newIdempotencyKey returns a fresh UUID each time', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
  it('keyEnvironment reads the environment segment', () => {
    expect(keyEnvironment('hbk_test_mockfull0001_fullscopes')).toBe('test');
    expect(keyEnvironment('hbk_live_k3f7x2m4q6zt_abcDEF123')).toBe('live');
    expect(keyEnvironment('hbk_prod_k3f7x2m4q6zt_abc')).toBe('invalid');
    expect(keyEnvironment('hbk_test_short_abc')).toBe('invalid');
    expect(keyEnvironment('')).toBe('invalid');
    expect(keyEnvironment('Bearer hbk_test_mockfull0001_fullscopes')).toBe('invalid');
  });
  it('redactKey keeps the environment and the id only', () => {
    expect(redactKey('hbk_test_mockfull0001_fullscopes')).toBe('hbk_test_mockfull0001_…');
    expect(redactKey('hbk_live_k3f7x2m4q6zt_abcDEF123')).toBe('hbk_live_k3f7x2m4q6zt_…');
    expect(redactKey('not a key')).toBe('…');
    expect(redactKey('hbk_test_mockfull0001_fullscopes')).not.toContain('fullscopes');
  });
});
