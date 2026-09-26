import { Link, Navigate } from 'react-router-dom';
import { ErrorNotice } from '../components/ErrorNotice';
import { useSession } from '../config/SessionProvider';
import { useOutlets } from '../menu/useOutlets';

export function OutletsPage() {
  const { client } = useSession();
  const query = useOutlets();
  if (!client) return <Navigate to="/setup" replace />;
  if (query.isPending) return <p className="p-4">Loading outlets…</p>;
  if (query.isError) return <div className="p-4"><ErrorNotice error={query.error} /></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="text-xl font-semibold">Restaurants taking your orders</h1>
      {query.data.map((outlet) => (
        <article key={outlet.outletId} className="rounded border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{outlet.name}</h2>
            <span className={`rounded px-2 py-0.5 text-xs ${outlet.acceptingOrders ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700'}`}>
              {outlet.acceptingOrders ? 'Accepting orders' : 'Not accepting orders'}
            </span>
          </div>
          <p className="text-sm text-slate-600">{[outlet.address, outlet.phone].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-slate-500">Auto-reject after {outlet.acceptTimeoutMinutes} min without an answer</p>
          <Link to={`/outlets/${outlet.outletId}/menu`} className="mt-2 inline-block text-sm underline">View menu</Link>
        </article>
      ))}
    </div>
  );
}
