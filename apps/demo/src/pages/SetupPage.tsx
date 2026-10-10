import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { redactKey } from '@foodops-partner/client';
import { useCart } from '../cart/CartProvider';
import { NOTICE_BOX } from '../components/ErrorNotice';
import { WebhookCard } from '../components/WebhookCard';
import { Wordmark } from '../components/Wordmark';
import { MODE_INFO } from '../config/modeInfo';
import { useSession } from '../config/SessionProvider';
import { normaliseBaseUrl, validateSettings } from '../config/settings';

export function SetupPage() {
  const { settings, mode, client, update } = useSession();
  const navigate = useNavigate();
  const cart = useCart();
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { baseUrl: normaliseBaseUrl(baseUrl), apiKey: apiKey.trim() || settings.apiKey };
    const message = validateSettings(next);
    setProblem(message);
    if (message) return;
    update(next);
    // A cart holds another server's variant ids: it cannot follow the user to a new base URL or key.
    cart.clear();
    navigate('/outlets');
  }

  return (
    <div className="p-4">
      <form onSubmit={submit} className="card mx-auto max-w-lg space-y-4 p-6">
        <Wordmark />
        <h1 className="text-2xl font-bold">Connect to a restaurant</h1>
        <p className="text-sm text-muted">
          The restaurant gives you a base URL and a key. Test keys start with <code>hbk_test_</code>; live keys with <code>hbk_live_</code> and only ever travel over https.
        </p>
        <label className="block text-sm">
          <span className="font-semibold">Base URL</span>
          <input className="field" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:4010" />
        </label>
        <label className="block text-sm">
          <span className="font-semibold">API key</span>
          <input className="field" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.apiKey ? `Keep current key ${redactKey(settings.apiKey)}` : 'hbk_test_…'} />
        </label>
        {settings.apiKey && <p className="text-xs text-muted">Current key: {redactKey(settings.apiKey)}</p>}
        {/* Only once a key is saved: before that there is no API to describe. */}
        {client && (
          <p className="dev-card" data-testid="mode-sentence">
            <span className="font-bold text-navy">{MODE_INFO[mode].label}.</span> {MODE_INFO[mode].hint}
          </p>
        )}
        {problem && <div role="alert" className={NOTICE_BOX}>{problem}</div>}
        <button type="submit" className="btn-primary w-full">Save and continue</button>
      </form>
      {/* Only once a key is saved: before that there is no API to register with. */}
      {client && <WebhookCard client={client} />}
    </div>
  );
}
