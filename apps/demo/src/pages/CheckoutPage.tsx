import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PartnerApiError } from '@foodops-partner/client';
import { estimateTotal, lineTotal } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { newPartnerReference, requestFingerprint, toCreateRequest } from '../cart/checkout';
import type { CheckoutForm } from '../cart/checkout';
import { keyFor } from '../cart/idempotency';
import type { KeyedRequest } from '../cart/idempotency';
import { DishImage } from '../components/DishImage';
import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../config/SessionProvider';
import { dishImageFor } from '../images/catalog';
import { saveTracked } from '../orders/orderStore';

const link = 'font-semibold underline decoration-mustard decoration-2 underline-offset-4';

export function CheckoutPage() {
  const { client } = useSession();
  const cart = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutForm>(() => ({ partnerReference: newPartnerReference(), customerName: '', customerPhone: '', notes: '', expectedPickupAt: '' }));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  /** The fingerprint of the request that just failed: only that exact request may be retried with its key. */
  const [failedFingerprint, setFailedFingerprint] = useState<string | null>(null);

  const outletId = cart.outletId ?? '';
  const request = toCreateRequest(outletId, cart.lines, form);
  const fingerprint = requestFingerprint(request);
  const [keyed, setKeyed] = useState<KeyedRequest>(() => keyFor(null, fingerprint));
  useEffect(() => { setKeyed((current) => keyFor(current, fingerprint)); }, [fingerprint]);

  if (!client) return <Navigate to="/setup" replace />;
  if (!cart.outletId || cart.lines.length === 0) {
    return (
      <div className="p-4">
        <p className="card mx-auto max-w-lg p-6 text-center">Your cart is empty. <Link to="/outlets" className={link}>Pick a restaurant.</Link></p>
      </div>
    );
  }

  const field = (key: keyof CheckoutForm) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !client) return;
    setBusy(true);
    setError(null);
    setFailedFingerprint(null);
    // The key for THIS request: unchanged since the last attempt ⇒ the same key, so the server replays instead of duplicating.
    const active = keyed.fingerprint === fingerprint ? keyed : keyFor(keyed, fingerprint);
    if (active !== keyed) setKeyed(active);
    try {
      const created = await client.createOrder(request, active.key);
      saveTracked({
        id: created.id, reference: created.reference, partnerReference: request.partnerReference,
        outletId: cart.outletId!, outletName: cart.outletName ?? cart.outletId!, createdAt: new Date().toISOString(),
        idempotencyKey: active.key, lastStatus: created.status, priceMismatch: created.priceMismatch,
        partnerTotal: created.partnerTotal, total: created.totals.total,
      });
      cart.clear();
      navigate(`/orders/${created.id}`);
    } catch (e) {
      setError(e);
      setFailedFingerprint(active.fingerprint);
    } finally {
      setBusy(false);
    }
  }

  const duplicateId = error instanceof PartnerApiError && error.code === 'duplicate_order' ? String(error.details?.orderId ?? '') : '';

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="truncate text-2xl font-bold" title={cart.outletName ?? undefined}>Checkout · {cart.outletName}</h1>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-lg font-semibold">Your order</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {cart.lines.map((line) => (
              <li key={line.lineId} className="flex items-start gap-3">
                <DishImage src={dishImageFor({ name: line.itemName, imageUrl: null })} name={line.itemName} className="h-12 w-12 shrink-0 rounded-xl text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{line.quantity} × {line.itemName} ({line.variantName})</p>
                  {line.modifiers.length > 0 && <p className="text-xs text-muted">{line.modifiers.map((m) => `${m.quantity} × ${m.name}`).join(', ')}</p>}
                  {line.note && <p className="text-xs italic text-muted">{line.note}</p>}
                </div>
                <span className="font-semibold">{lineTotal(line).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex justify-between border-t border-sand pt-3 font-bold"><span>Estimate, sent as partnerTotal</span><span>{estimateTotal(cart.lines).toFixed(2)}</span></p>
          <p className="text-xs text-muted">The restaurant's total is the one that counts.</p>
        </section>
        {/* Disabled while the order is in flight: an edit mid-request would change the key under a live attempt. */}
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="text-lg font-semibold">Who's this for?</h2>
            <label className="block text-sm"><span className="font-semibold">Your reference</span>
              <input className="field" value={form.partnerReference} onChange={field('partnerReference')} maxLength={64} /></label>
            <label className="block text-sm"><span className="font-semibold">Customer name</span>
              <input className="field" value={form.customerName} onChange={field('customerName')} maxLength={100} /></label>
            <label className="block text-sm"><span className="font-semibold">Customer phone</span>
              <input className="field" value={form.customerPhone} onChange={field('customerPhone')} maxLength={32} /></label>
            <label className="block text-sm"><span className="font-semibold">Order notes</span>
              <textarea className="field" value={form.notes} onChange={field('notes')} maxLength={500} /></label>
            <label className="block text-sm"><span className="font-semibold">Pickup time (optional)</span>
              <input type="datetime-local" className="field" value={form.expectedPickupAt} onChange={field('expectedPickupAt')} /></label>
          </section>
          <section className="dev-card">
            <p className="font-bold text-navy">Developer: retry key</p>
            <p className="break-all font-mono text-navy" data-testid="idempotency-key">{keyed.key}</p>
            <p className="mt-1">Minted when this checkout opened. Change anything above and a new one appears. A retry after a failure sends this same key, so the restaurant replays the order instead of making a second one.</p>
          </section>
          <ErrorNotice error={error} />
          {duplicateId && <Link to={`/orders/${duplicateId}`} className={`block text-sm ${link}`}>Open the existing order</Link>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Placing…' : failedFingerprint === fingerprint ? 'Try again with the same key' : 'Place order'}
          </button>
        </fieldset>
      </div>
    </form>
  );
}
