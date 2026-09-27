import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorNotice } from '../components/ErrorNotice';
import { RestaurantCard } from '../components/RestaurantCard';
import { useSession } from '../config/SessionProvider';
import { heroImage } from '../images/catalog';
import { useOutlets } from '../menu/useOutlets';

export function OutletsPage() {
  const { client } = useSession();
  const query = useOutlets();
  const [filter, setFilter] = useState('');
  if (!client) return <Navigate to="/setup" replace />;
  if (query.isPending) return <p className="p-4 text-muted">Finding restaurants…</p>;
  if (query.isError) return <div className="p-4"><ErrorNotice error={query.error} /></div>;

  const needle = filter.trim().toLowerCase();
  const shown = needle ? query.data.filter((outlet) => outlet.name.toLowerCase().includes(needle)) : query.data;
  const hero = heroImage();
  const backdrop = hero
    ? { backgroundImage: `linear-gradient(rgba(11,31,68,.78), rgba(11,31,68,.78)), url(${hero})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;

  return (
    <div className="space-y-5 p-4">
      <section className="card overflow-hidden bg-navy text-white" style={backdrop}>
        <div className="space-y-3 p-6">
          <h1 className="text-3xl font-bold text-mustard">Hungry? Kaana's got you.</h1>
          <p className="text-sm text-white/80">Restaurants taking your orders, with the prices they set for you.</p>
          <label className="block">
            <span className="sr-only">Find a restaurant</span>
            <input type="search" className="field" placeholder="Find a restaurant" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
        </div>
      </section>
      {query.data.length === 0
        ? <p className="card p-6 text-center text-muted">No restaurants are available to this key yet. Ask the restaurant to assign its outlets to your key.</p>
        : shown.length === 0
        ? <p className="p-6 text-center text-muted">No restaurant matches “{filter.trim()}”.</p>
        : <div className="grid gap-4 sm:grid-cols-2">{shown.map((outlet) => <RestaurantCard key={outlet.outletId} outlet={outlet} />)}</div>}
    </div>
  );
}
