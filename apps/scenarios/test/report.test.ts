import { describe, expect, it } from 'vitest';
import { formatJson, formatTable, summarise } from '../src/report';
import type { ScenarioResult } from '../src/scenario';

const results: ScenarioResult[] = [
  { name: 'outlets.list', outcome: 'pass' },
  { name: 'order.outlet-closed', outcome: 'skipped', reason: 'needs closed-outlet' },
  { name: 'order.create', outcome: 'fail', message: 'expected 201, got 409' },
];

describe('report', () => {
  it('summarises', () => {
    expect(summarise(results)).toEqual({ passed: 1, failed: 1, skipped: 1 });
  });
  it('formats a table with aligned names and a summary line', () => {
    expect(formatTable(results)).toBe([
      'PASS  outlets.list',
      'SKIP  order.outlet-closed  needs closed-outlet',
      'FAIL  order.create         expected 201, got 409',
      '',
      '1 passed, 1 failed, 1 skipped',
    ].join('\n'));
  });
  it('formats JSON with results and summary', () => {
    expect(JSON.parse(formatJson(results))).toEqual({ results, summary: { passed: 1, failed: 1, skipped: 1 } });
  });
});
