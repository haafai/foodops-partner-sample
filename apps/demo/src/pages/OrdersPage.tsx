import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { PartnerApiError, isTerminal } from '@foodops-partner/client';
import type { PartnerOrder } from '@foodops-partner/client';
import { StatusPill } from '../components/StatusPill';
import { errorLine } from '../errors/errorText';
import { useSession } from '../config/SessionProvider';
import { listTracked, updateTracked } from '../orders/orderStore';
import { BOARD_POLL_MS } from '../orders/polling';

export function OrdersPage() {
  const { client } = useSession();
  const tracked = listTracked();
  const [, bump] = useState(0);
  const queries = useQueries({
    queries: tracked.map((order) => ({
      queryKey: ['order', order.id],
      queryFn: () => client!.getOrder(order.id),
      enabled: client !== null && !isTerminal(order.lastStatus),
      // A row that errored (a 404 for another key's order, say) stops polling instead of failing every 15 s.
      refetchInterval: (q: Query<PartnerOrder>) => (q.state.error ? false : BOARD_POLL_MS),
      retry: false,
    })),
  });
  // The board's own `enabled` gate reads `lastStatus` from the store, so a terminal status
  // reached only here (never opened on OrderPage) must be written back or polling never stops.
  const signature = queries.map((q) => q.data?.status ?? '').join(',');
  useEffect(() => {
    let changed = false;
    queries.forEach((query, i) => {
      const order = tracked[i];
      if (order && query.data && query.data.status !== order.lastStatus) {
        updateTracked(order.id, { lastStatus: query.data.status });
        changed = true;
      }
    });
    if (changed) bump((n) => n + 1);
  }, [signature, queries, tracked]);
  if (!client) return <Navigate to="/setup" replace />;
  if (tracked.length === 0) {
    return (
      <div className="p-4">
        <div className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-8 text-center">
          <svg aria-hidden="true" viewBox="0 0 48 48" className="h-16 w-16">
            <circle cx="24" cy="24" r="21" fill="#EDE4D3" />
            <circle cx="24" cy="24" r="13" fill="#FFFFFF" />
            <circle cx="24" cy="24" r="13" fill="none" stroke="#0B1F44" strokeOpacity="0.15" strokeWidth="1.5" />
          </svg>
          <p className="text-muted">No orders placed from this browser yet.</p>
          <Link to="/outlets" className="btn-primary">Find a restaurant</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="text-2xl font-bold">Your orders</h1>
      <ul className="space-y-3">
        {tracked.map((order, i) => {
          const query = queries[i];
          const error = query.error;
          const status = query.data?.status ?? order.lastStatus;
          return (
            <li key={order.id}>
              <article className="card transition hover:-translate-y-0.5">
                <Link to={`/orders/${order.id}`} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold">{order.reference}</p>
                    <p className="truncate text-sm" title={order.outletName}>{order.outletName}</p>
                    <p className="truncate text-xs text-muted">{order.partnerReference} · {new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  {error instanceof PartnerApiError && error.status === 404
                    ? <span className="text-xs font-semibold text-muted">Not visible with this key</span>
                    : error instanceof PartnerApiError
                      ? <span className="max-w-[45%] text-right text-xs font-semibold text-chili">{errorLine(error)}</span>
                      : <StatusPill status={status} />}
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">Orders placed from this browser. Open ones are re-checked every {BOARD_POLL_MS / 1000} s; finished ones are not.</p>
    </div>
  );
}
