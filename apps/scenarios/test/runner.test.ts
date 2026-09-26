import { describe, expect, it } from 'vitest';
import { runScenarios } from '../src/runner';
import { SkipScenario } from '../src/scenario';
import type { Scenario, ScenarioContext } from '../src/scenario';

function fakeContext(capabilities: string[]) {
  let cleanups = 0;
  const ctx = { capabilities: new Set(capabilities), cleanup: async () => { cleanups++; } } as unknown as ScenarioContext;
  return { ctx, cleanups: () => cleanups };
}

const scenarios: Scenario[] = [
  { name: 'a.pass', requires: [], run: async () => {} },
  { name: 'b.fail', requires: [], run: async () => { throw new Error('boom'); } },
  { name: 'c.needs', requires: ['closed-outlet'], run: async () => {} },
  { name: 'd.skips', requires: [], run: async () => { throw new SkipScenario('menu has no such thing'); } },
];

describe('runScenarios', () => {
  it('reports pass, fail with the message, skipped with the reason, and cleans up after each run', async () => {
    const { ctx, cleanups } = fakeContext(['mock-control']);
    const results = await runScenarios(scenarios, ctx);
    expect(results).toEqual([
      { name: 'a.pass', outcome: 'pass' },
      { name: 'b.fail', outcome: 'fail', message: 'boom' },
      { name: 'c.needs', outcome: 'skipped', reason: 'needs closed-outlet' },
      { name: 'd.skips', outcome: 'skipped', reason: 'menu has no such thing' },
    ]);
    expect(cleanups()).toBe(3);
  });

  it('runs only the named scenarios when asked', async () => {
    const { ctx } = fakeContext([]);
    const results = await runScenarios(scenarios, ctx, { only: ['b.fail'] });
    expect(results.map((r) => r.name)).toEqual(['b.fail']);
  });
});
