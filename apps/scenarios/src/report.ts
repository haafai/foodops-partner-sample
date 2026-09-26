import type { ScenarioResult } from './scenario';

export interface Summary { passed: number; failed: number; skipped: number }

export function summarise(results: ScenarioResult[]): Summary {
  return {
    passed: results.filter((r) => r.outcome === 'pass').length,
    failed: results.filter((r) => r.outcome === 'fail').length,
    skipped: results.filter((r) => r.outcome === 'skipped').length,
  };
}

export function formatTable(results: ScenarioResult[]): string {
  const width = Math.max(4, ...results.map((r) => r.name.length));
  const lines = results.map((r) => {
    const label = r.outcome === 'pass' ? 'PASS' : r.outcome === 'fail' ? 'FAIL' : 'SKIP';
    const detail = r.outcome === 'fail' ? r.message : r.outcome === 'skipped' ? r.reason : '';
    return `${label}  ${r.name.padEnd(width)}  ${detail}`.trimEnd();
  });
  const s = summarise(results);
  lines.push('', `${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped`);
  return lines.join('\n');
}

export function formatJson(results: ScenarioResult[]): string {
  return JSON.stringify({ results, summary: summarise(results) }, null, 2);
}
