import { parseArgs } from 'node:util';
import { redactKey } from '@foodops-partner/client';
import { createContext } from './context';
import { ALL_SCENARIOS } from './index';
import { formatJson, formatTable, summarise } from './report';
import { runScenarios } from './runner';

const USAGE = `partner-scenarios --base-url <url> --key <hbk_…> [--only a,b] [--json]
                  [--closed-outlet-id <id>] [--menu-only-key <hbk_…>] [--unbound-key <hbk_…>]

Runs every scenario against the API at --base-url. Scenarios that need the mock's
restaurant simulator, a closed outlet, or an extra key are skipped unless the target
provides them. Base URL and key also come from PARTNER_API_BASE_URL / PARTNER_API_KEY
(a .env file in the current directory is read).`;

try {
  process.loadEnvFile();
} catch {
  // No .env file: flags or exported variables must supply the values.
}

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    key: { type: 'string' },
    only: { type: 'string' },
    json: { type: 'boolean', default: false },
    'closed-outlet-id': { type: 'string' },
    'menu-only-key': { type: 'string' },
    'unbound-key': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const baseUrl = values['base-url'] ?? process.env.PARTNER_API_BASE_URL;
const apiKey = values.key ?? process.env.PARTNER_API_KEY;
if (!baseUrl || !apiKey) {
  console.error('Need --base-url and --key, or PARTNER_API_BASE_URL and PARTNER_API_KEY.\n');
  console.error(USAGE);
  process.exit(2);
}

const ctx = await createContext({
  baseUrl, apiKey,
  closedOutletId: values['closed-outlet-id'], menuOnlyKey: values['menu-only-key'], unboundKey: values['unbound-key'],
});
if (!values.json) {
  console.error(`Target ${ctx.baseUrl} · key ${redactKey(apiKey)} · capabilities: ${[...ctx.capabilities].join(', ') || 'none'}`);
}
const only = values.only?.split(',').map((s) => s.trim()).filter(Boolean);
const results = await runScenarios(ALL_SCENARIOS, ctx, { only });
console.log(values.json ? formatJson(results) : formatTable(results));
process.exit(summarise(results).failed > 0 ? 1 : 0);
