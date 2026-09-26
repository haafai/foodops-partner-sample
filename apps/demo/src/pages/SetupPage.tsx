import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { redactKey } from '@foodops-partner/client';
import { useCart } from '../cart/CartProvider';
import { useSession } from '../config/SessionProvider';
import { normaliseBaseUrl, validateSettings } from '../config/settings';

export function SetupPage() {
  const { settings, update } = useSession();
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
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Connect to a restaurant</h1>
      <p className="text-sm text-slate-600">
        The restaurant gives you a base URL and a key. Test keys start with <code>hbk_test_</code>; live keys with <code>hbk_live_</code> and only ever travel over https.
      </p>
      <label className="block text-sm">
        <span className="font-medium">Base URL</span>
        <input className="mt-1 w-full rounded border px-2 py-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:4010" />
      </label>
      <label className="block text-sm">
        <span className="font-medium">API key</span>
        <input className="mt-1 w-full rounded border px-2 py-1" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={settings.apiKey ? `Keep current key ${redactKey(settings.apiKey)}` : 'hbk_test_…'} />
      </label>
      {settings.apiKey && <p className="text-xs text-slate-500">Current key: {redactKey(settings.apiKey)}</p>}
      {problem && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{problem}</div>}
      <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save and continue</button>
    </form>
  );
}
