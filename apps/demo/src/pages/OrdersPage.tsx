import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { PartnerApiError, isTerminal } from '@foodops-partner/client';
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
      refetchInterval: BOARD_POLL_MS,
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
  if (tracked.length === 0) return <p className="p-4 text-sm text-slate-600">No orders placed from this browser yet.</p>;
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-semibold">Orders from this browser</h1>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-slate-500"><th>Reference</th><th>Restaurant</th><th>Placed</th><th>Status</th></tr></thead>
        <tbody>
          {tracked.map((order, i) => {
            const query = queries[i];
            const error = query.error;
            const status = query.data?.status ?? order.lastStatus;
            return (
              <tr key={order.id} className="border-t">
                <td><Link to={`/orders/${order.id}`} className="underline">{order.reference}</Link><div className="text-xs text-slate-500">{order.partnerReference}</div></td>
                <td>{order.outletName}</td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
                <td>
                  {error instanceof PartnerApiError && error.status === 404
                    ? <span className="text-slate-500">Not visible with this key</span>
                    : error instanceof PartnerApiError
                      ? <span className="text-red-700">{errorLine(error)}</span>
                      : <span className={isTerminal(status) ? 'text-slate-500' : 'font-medium'}>{status}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">Open orders are re-checked every {BOARD_POLL_MS / 1000} s; finished ones are not.</p>
    </div>
  );
}
