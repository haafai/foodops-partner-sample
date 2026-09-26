import { describe, expect, it } from 'vitest';
import { detectMode } from '../src/config/mode';

const SNAPSHOT = JSON.stringify({ outlets: [], orders: [], faults: [], autopilot: { enabled: true, stepSeconds: 5 } });
const mockAnswers = (async () => new Response(SNAPSHOT, { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
const htmlAnswers = (async () => new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;
const dead = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;

describe('detectMode', () => {
  it('is mock when /_mock/state answers with the mock snapshot', async () => {
    expect(await detectMode({ baseUrl: 'http://x', apiKey: 'hbk_test_mockfull0001_fullscopes' }, mockAnswers)).toBe('mock');
  });
  it('is live for a live key when the mock does not answer', async () => {
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_live_k3f7x2m4q6zt_abc' }, dead)).toBe('live');
  });
  it('is live for a live key even when /_mock/state answers, and never asks', async () => {
    let asked = 0;
    const counting = (async (...args: Parameters<typeof fetch>) => { asked++; return mockAnswers(...args); }) as typeof fetch;
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_live_k3f7x2m4q6zt_abc' }, counting)).toBe('live');
    expect(asked).toBe(0);
  });
  it('is local when any 200 answers that is not the mock snapshot', async () => {
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_test_mockfull0001_fullscopes' }, htmlAnswers)).toBe('local');
  });
  it('is local otherwise', async () => {
    expect(await detectMode({ baseUrl: 'https://x', apiKey: 'hbk_test_mockfull0001_fullscopes' }, dead)).toBe('local');
  });
});
