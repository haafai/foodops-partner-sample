import { describe, expect, it } from 'vitest';
import { detectMode } from '../src/config/mode';

const ok = (async () => new Response('{}', { status: 200 })) as typeof fetch;
const dead = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;

describe('detectMode', () => {
  it('is mock when /_mock/state answers', async () => {
    expect(await detectMode({ baseUrl: 'http://x', apiKey: 'hbk_test_mockfull0001_fullscopes' }, ok)).toBe('mock');
  });
  it('is live for a live key when the mock does not answer', async () => {
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_live_k3f7x2m4q6zt_abc' }, dead)).toBe('live');
  });
  it('is local otherwise', async () => {
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_test_mockfull0001_fullscopes' }, dead)).toBe('local');
  });
});
