import path from 'node:path';
import { decodeWebhookSecret } from '@foodops-partner/client';
import { DEFAULT_ALLOWED_ORIGINS, startReceiver } from './receiver';

// `npm run receiver` runs this inside the package; INIT_CWD is where npm was invoked (the repo root).
try {
  process.loadEnvFile(path.join(process.env.INIT_CWD ?? process.cwd(), '.env'));
} catch {
  // No .env file: the defaults below apply.
}

const secret = process.env.PARTNER_WEBHOOK_SECRET?.trim() || null;
if (secret && !decodeWebhookSecret(secret)) {
  console.error('PARTNER_WEBHOOK_SECRET is not a whsec_ secret. Remove it, or paste the value PUT webhook returned.');
  process.exit(2);
}
const allowedOrigins = process.env.WEBHOOK_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ALLOWED_ORIGINS;
const handle = await startReceiver({
  webhookPort: Number(process.env.WEBHOOK_PORT ?? 4020),
  controlPort: Number(process.env.WEBHOOK_CONTROL_PORT ?? 4021),
  secret, allowedOrigins,
});
console.log(`Webhook receiver listening on ${handle.webhookUrl}`);
console.log(`  This is the only port to put a tunnel or a proxy in front of: ${handle.webhookPort}`);
console.log(`Local control on ${handle.controlUrl}/_receiver/state (this machine only; never expose port ${handle.controlPort})`);
// The secret itself is never printed.
console.log(secret ? 'A signing secret was loaded from PARTNER_WEBHOOK_SECRET.' : 'No signing secret yet: every delivery is answered 401 until one is registered.');

const stop = (): void => {
  void handle.close().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
