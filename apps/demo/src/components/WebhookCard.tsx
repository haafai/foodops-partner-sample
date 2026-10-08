import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PartnerApiError } from '@foodops-partner/client';
import type { PartnerClient, PartnerWebhook, PartnerWebhookOutcome } from '@foodops-partner/client';
import { ReceiverControl } from '@foodops-partner/webhook-receiver/control-client';
import { useSession } from '../config/SessionProvider';
import { WEBHOOK_QUERY_KEY, useWebhook } from '../webhooks/useWebhook';
import { loadWebhookSettings, normaliseWebhookSettings, saveWebhookSettings, validateWebhookSettings } from '../webhooks/webhookSettings';
import { ErrorNotice } from './ErrorNotice';

const OUTCOMES: Record<PartnerWebhookOutcome, string> = {
  delivered: 'delivered',
  http_error: 'your endpoint answered with an error',
  timeout: 'no answer within 5 seconds',
  connection_failed: 'could not connect',
  blocked_address: 'refused: the URL now resolves to a private address',
};

function lastDeliveryLine(hook: PartnerWebhook): string {
  const last = hook.lastDelivery;
  if (!last) return 'No event has been sent yet.';
  const outcome = OUTCOMES[last.outcome] ?? last.outcome;
  return `Last event ${new Date(last.at).toLocaleString()}: ${outcome}${last.httpStatus === null ? '' : ` (HTTP ${last.httpStatus})`}.`;
}

/** Register, replace or remove this key's webhook, and show what the restaurant and the receiver each report. */
export function WebhookCard({ client }: { client: PartnerClient }) {
  const { mode } = useSession();
  const queryClient = useQueryClient();
  const hook = useWebhook({ live: true });
  const [saved, setSaved] = useState(loadWebhookSettings);
  const [receiverUrl, setReceiverUrl] = useState(saved.receiverUrl);
  const [publicUrl, setPublicUrl] = useState(saved.publicUrl);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const registered = hook.data ?? null;
  const pointsHere = registered !== null && registered.url === saved.publicUrl;

  // Asked only once something is registered: a page with no webhook makes no call to the receiver at all.
  const receiver = useQuery({
    queryKey: ['webhook-receiver', saved.receiverUrl],
    enabled: pointsHere,
    refetchInterval: 5_000,
    retry: false,
    queryFn: () => new ReceiverControl(saved.receiverUrl).state(),
  });

  async function register() {
    const next = normaliseWebhookSettings({ receiverUrl, publicUrl });
    const message = validateWebhookSettings(next, mode);
    if (message) {
      setProblem(new Error(message));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      // Checked BEFORE the PUT: a PUT replaces the secret at once, so one that the receiver never gets
      // would leave every delivery refused.
      if (!(await ReceiverControl.detect(next.receiverUrl))) {
        setProblem(new Error(`No receiver is answering at ${next.receiverUrl}. Start it with "npm run receiver" and try again. Nothing was changed.`));
        return;
      }
      const { secret, ...endpoint } = await client.setWebhook(next.publicUrl);
      saveWebhookSettings(next);
      setSaved(next);
      queryClient.setQueryData<PartnerWebhook | null>(WEBHOOK_QUERY_KEY, endpoint);
      // The secret goes straight to the receiver. It is never put in state, storage, the query cache or the page.
      try {
        await new ReceiverControl(next.receiverUrl).setSecret(secret);
      } catch {
        setProblem(new Error('The restaurant registered the URL, but the receiver did not take the secret, so it will refuse every delivery. Press Register again: that issues a new secret.'));
      }
    } catch (e) {
      // 404 on PUT is not "no webhook set": it means these endpoints do not exist on this API.
      setProblem(e instanceof PartnerApiError && e.status === 404 ? new Error('This restaurant\'s API does not offer webhooks. Polling keeps working as before.') : e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      await client.deleteWebhook();
      queryClient.setQueryData<PartnerWebhook | null>(WEBHOOK_QUERY_KEY, null);
      // The restaurant has already stopped sending; a receiver that is not running has nothing to forget.
      await new ReceiverControl(saved.receiverUrl).clearSecret().catch(() => undefined);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Webhooks" className="card mx-auto mt-4 max-w-lg space-y-3 p-6">
      <h2 className="text-lg font-semibold">Webhooks</h2>
      <p className="text-sm text-muted">
        Instead of asking every few seconds, let the restaurant tell you. It posts a signed event to the URL you register here; the receiver
        (<code>npm run receiver</code>) checks every signature, and this app reads what the receiver accepted. Polling stays on, slowly, as the backstop.
      </p>
      <label className="block text-sm">
        <span className="font-semibold">Webhook URL the restaurant will call</span>
        <input className="field" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://…/webhooks/foodops" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Receiver control address (this machine)</span>
        <input className="field" value={receiverUrl} onChange={(e) => setReceiverUrl(e.target.value)} placeholder="http://127.0.0.1:4021" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void register()}>
          {registered ? 'Register again (new secret)' : 'Register webhook'}
        </button>
        <button type="button" className="btn-ghost" disabled={busy || !registered} onClick={() => void remove()}>Remove webhook</button>
      </div>
      <div className="dev-card space-y-1" data-testid="webhook-status">
        {hook.isPending && <p>Checking…</p>}
        {hook.isSuccess && !registered && <p>No webhook is registered for this key.</p>}
        {registered && (
          <>
            <p><span className="font-bold text-navy">Registered.</span> {registered.url}</p>
            <p>Events: {registered.events.join(', ')}</p>
            <p>{lastDeliveryLine(registered)}</p>
            {registered.consecutiveFailures > 0 && <p className="font-semibold text-chili">{registered.consecutiveFailures} failed in a row. Nothing is re-sent; the next change sends the next event.</p>}
            {!pointsHere && <p className="font-semibold text-chili">This webhook points somewhere other than the URL above, so this app is not receiving its events. Register to take it over.</p>}
          </>
        )}
        {pointsHere && receiver.isSuccess && (
          <p>
            Receiver: {receiver.data.received} accepted, {receiver.data.rejected} refused
            {receiver.data.lastRejection ? ` (last reason: ${receiver.data.lastRejection.reason})` : ''}.
            {!receiver.data.hasSecret && <span className="font-semibold text-chili"> It has no secret (it was restarted). Register again.</span>}
          </p>
        )}
        {pointsHere && receiver.isError && <p className="font-semibold text-chili">No receiver is answering at {saved.receiverUrl}. Events are being refused or lost; polling is covering.</p>}
      </div>
      {hook.isError && <ErrorNotice error={hook.error} />}
      <ErrorNotice error={problem} />
    </section>
  );
}
