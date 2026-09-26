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
import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../config/SessionProvider';
import { saveTracked } from '../orders/orderStore';

export function CheckoutPage() {
  const { client } = useSession();
  const cart = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState<CheckoutForm>(() => ({ partnerReference: newPartnerReference(), customerName: '', customerPhone: '', notes: '', expectedPickupAt: '' }));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const outletId = cart.outletId ?? '';
  const request = toCreateRequest(outletId, cart.lines, form);
  const fingerprint = requestFingerprint(request);
  const [keyed, setKeyed] = useState<KeyedRequest>(() => keyFor(null, fingerprint));
  useEffect(() => { setKeyed((current) => keyFor(current, fingerprint)); }, [fingerprint]);

  if (!client) return <Navigate to="/setup" replace />;
  if (!cart.outletId || cart.lines.length === 0) {
    return <p className="p-4">Your cart is empty. <Link to="/outlets" className="underline">Pick a restaurant.</Link></p>;
  }

  const field = (key: keyof CheckoutForm) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !client) return;
    setBusy(true);
    setError(null);
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
    } finally {
      setBusy(false);
    }
  }

  const duplicateId = error instanceof PartnerApiError && error.code === 'duplicate_order' ? String(error.details?.orderId ?? '') : '';

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-3xl gap-4 p-4 md:grid-cols-2">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Checkout · {cart.outletName}</h1>
        <label className="block text-sm"><span className="font-medium">Your reference</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={form.partnerReference} onChange={field('partnerReference')} maxLength={64} /></label>
        <label className="block text-sm"><span className="font-medium">Customer name</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={form.customerName} onChange={field('customerName')} maxLength={100} /></label>
        <label className="block text-sm"><span className="font-medium">Customer phone</span>
          <input className="mt-1 w-full rounded border px-2 py-1" value={form.customerPhone} onChange={field('customerPhone')} maxLength={32} /></label>
        <label className="block text-sm"><span className="font-medium">Order notes</span>
          <textarea className="mt-1 w-full rounded border px-2 py-1" value={form.notes} onChange={field('notes')} maxLength={500} /></label>
        <label className="block text-sm"><span className="font-medium">Pickup time (optional)</span>
          <input type="datetime-local" className="mt-1 w-full rounded border px-2 py-1" value={form.expectedPickupAt} onChange={field('expectedPickupAt')} /></label>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Order</h2>
        <ul className="space-y-1 text-sm">
          {cart.lines.map((line) => (
            <li key={line.lineId} className="flex justify-between"><span>{line.quantity} × {line.itemName} ({line.variantName})</span><span>{lineTotal(line).toFixed(2)}</span></li>
          ))}
        </ul>
        <p className="flex justify-between border-t pt-2 text-sm font-medium"><span>Estimate, sent as partnerTotal</span><span>{estimateTotal(cart.lines).toFixed(2)}</span></p>
        <div className="rounded border bg-slate-100 p-3 text-xs text-slate-700">
          <p className="font-medium">Retry key</p>
          <p className="break-all font-mono" data-testid="idempotency-key">{keyed.key}</p>
          <p className="mt-1">Minted when this checkout opened. Change anything above and a new one appears. A retry after a failure sends this same key, so the restaurant replays the order instead of making a second one.</p>
        </div>
        <ErrorNotice error={error} />
        {duplicateId && <Link to={`/orders/${duplicateId}`} className="block text-sm underline">Open the existing order</Link>}
        <button type="submit" disabled={busy} className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Placing…' : error ? 'Try again with the same key' : 'Place order'}
        </button>
      </section>
    </form>
  );
}
