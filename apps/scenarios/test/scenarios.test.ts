import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FULL_KEY, startMockServer } from '@foodops-partner/mock-server';
import type { MockServerHandle } from '@foodops-partner/mock-server';
import { createContext } from '../src/context';
import { ALL_SCENARIOS } from '../src/index';
import { runScenarios } from '../src/runner';

let handle: MockServerHandle;
beforeAll(async () => { handle = await startMockServer(); });
afterAll(async () => { await handle.close(); });

describe('every scenario against the mock', () => {
  it('passes; none is skipped because the mock has every capability', async () => {
    const ctx = await createContext({ baseUrl: handle.url, apiKey: FULL_KEY });
    const results = await runScenarios(ALL_SCENARIOS, ctx);
    const notPassing = results.filter((r) => r.outcome !== 'pass');
    expect(notPassing, JSON.stringify(notPassing, null, 2)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual(ALL_SCENARIOS.map((s) => s.name));
  });

  it('scenario names are unique and dotted', () => {
    const names = ALL_SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+\.[a-z0-9.-]+$/);
  });
});
