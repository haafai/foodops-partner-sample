import { MOCK_KEYS } from './fixtures';
import { startMockServer } from './server';

const port = Number(process.env.PORT ?? 4010);
const handle = await startMockServer({ port, host: '127.0.0.1' });
console.log(`Partner API mock listening on ${handle.url}`);
console.log('Built-in keys (fixtures, not secrets):');
for (const key of MOCK_KEYS) console.log(`  ${key.key}  (${key.label})`);
console.log(`Restaurant simulator: ${handle.url}/_mock/state`);

const stop = (): void => {
  void handle.close().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
