import { SkipScenario } from './scenario';
import type { Scenario, ScenarioContext, ScenarioResult } from './scenario';

export interface RunOptions { only?: string[] }

/** Runs scenarios one at a time (the rate limit is per key), cleaning up after each. */
export async function runScenarios(scenarios: Scenario[], ctx: ScenarioContext, options: RunOptions = {}): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    if (options.only && !options.only.includes(scenario.name)) continue;
    const missing = scenario.requires.filter((c) => !ctx.capabilities.has(c));
    if (missing.length > 0) {
      results.push({ name: scenario.name, outcome: 'skipped', reason: `needs ${missing.join(', ')}` });
      continue;
    }
    try {
      await scenario.run(ctx);
      results.push({ name: scenario.name, outcome: 'pass' });
    } catch (error) {
      if (error instanceof SkipScenario) results.push({ name: scenario.name, outcome: 'skipped', reason: error.message });
      else results.push({ name: scenario.name, outcome: 'fail', message: error instanceof Error ? error.message : String(error) });
    } finally {
      await ctx.cleanup();
    }
  }
  return results;
}
