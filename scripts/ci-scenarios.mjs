// Starts the mock, waits for it, runs every scenario against it with JSON output, stops the mock,
// and exits with the runner's code. This is the integration test of client + mock together.
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 4010);
const baseUrl = `http://127.0.0.1:${port}`;
const key = 'hbk_test_mockfull0001_fullscopes';

const mock = spawn(process.execPath, ['--import', 'tsx', 'packages/mock-server/src/bin.ts'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit',
});

async function waitForMock(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/_mock/state`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The mock did not answer on ${baseUrl} within ${timeoutMs} ms`);
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'apps/scenarios/src/cli.ts', ...args], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

try {
  await waitForMock(15_000);
  process.exitCode = await run(['--base-url', baseUrl, '--key', key, '--json']);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  mock.kill();
}
