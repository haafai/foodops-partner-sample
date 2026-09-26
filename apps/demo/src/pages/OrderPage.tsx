import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { canCancel, isTerminal, newIdempotencyKey } from '@foodops-partner/client';
import { ErrorNotice } from '../components/ErrorNotice';
import { SimulatorPanel } from '../components/SimulatorPanel';
import { StatusTimeline } from '../components/StatusTimeline';
import { useSession } from '../config/SessionProvider';
import { listTracked, updateTracked } from '../orders/orderStore';
import { pollIntervalMs } from '../orders/polling';
import { useOrder } from '../orders/useOrder';

const money = (n: number) => n.toFixed(2);

export function OrderPage() {
  const { orderId = '' } = useParams();
  const { client, mode } = useSession();
  const queryClient = useQueryClient();
  const query = useOrder(orderId);
  const tracked = listTracked().find((o) => o.id === orderId);
  const [reason, setReason] = useState('Customer cancelled');
  // One key per page visit: a cancel retried after a network failure replays instead of conflicting.
  const [cancelKey] = useState(() => newIdempotencyKey());
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);

  useEffect(() => {
    if (query.data) updateTracked(orderId, { lastStatus: query.data.status });
  }, [orderId, query.data]);

  if (!client) return <Navigate to="/setup" replace />;
  if (query.isPending) return <p className="p-4">Loading order…</p>;
  if (!query.data) return <div className="p-4"><ErrorNotice error={query.error} /></div>;
  const order = query.data;
  const interval = pollIntervalMs({ status: order.status, createdAt: order.createdAt, now: Date.now() });

  async function cancel() {
    if (!client) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await client.cancelOrder(orderId, reason, cancelKey);
      queryClient.setQueryData(['order', orderId], updated);
    } catch (e) {
      setCancelError(e);
      await query.refetch();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">{order.reference} <span className="text-sm font-normal text-slate-500">· your reference {order.partnerReference}</span></h1>
        {tracked && <p className="text-sm text-slate-600">{tracked.outletName}</p>}
      </header>
      <StatusTimeline order={order} />
      <p className="text-sm">Status: <strong data-testid="order-status">{order.status}</strong>{order.reason && <span> · {order.reason}</span>}</p>
      <p className="text-xs text-slate-500">{interval === false ? 'Final status; polling stopped.' : `Checking every ${interval / 1000} s.`}</p>
      {query.isError && <ErrorNotice error={query.error} />}
      <table className="w-full text-sm">
        <tbody>
          <tr><td>Subtotal</td><td className="text-right">{money(order.totals.subtotal)}</td></tr>
          <tr><td>Tax (included)</td><td className="text-right">{money(order.totals.tax)}</td></tr>
          <tr><td>Service charge</td><td className="text-right">{money(order.totals.serviceCharge)}</td></tr>
          <tr className="font-medium"><td>Restaurant total</td><td className="text-right">{money(order.totals.total)}</td></tr>
        </tbody>
      </table>
      {tracked?.priceMismatch && (
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The restaurant's total ({money(tracked.total)}) differs from your estimate ({money(tracked.partnerTotal ?? 0)}). The restaurant's total is what is charged; the order still went through.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input className="rounded border px-2 py-1" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} aria-label="Cancellation reason" />
        <button type="button" className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-40" disabled={!canCancel(order.status) || cancelling} onClick={cancel}>Cancel order</button>
        {!canCancel(order.status) && !isTerminal(order.status) && <span className="text-xs text-slate-500">The kitchen has started; call the restaurant.</span>}
      </div>
      <ErrorNotice error={cancelError} />
      {mode === 'mock' && <SimulatorPanel orderId={orderId} status={order.status} />}
    </div>
  );
}
