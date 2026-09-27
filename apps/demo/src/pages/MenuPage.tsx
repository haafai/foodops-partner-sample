import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { PartnerMenuItem } from '@foodops-partner/client';
import type { CartLine } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { CartBar } from '../components/CartBar';
import { CartSummary } from '../components/CartSummary';
import { CategoryTabs } from '../components/CategoryTabs';
import { DishCard } from '../components/DishCard';
import { DishImage } from '../components/DishImage';
import { ErrorNotice } from '../components/ErrorNotice';
import { ModifierSheet } from '../components/ModifierSheet';
import { useSession } from '../config/SessionProvider';
import { outletImageFor } from '../images/catalog';
import { useMenu } from '../menu/useMenu';
import { useOutlets } from '../menu/useOutlets';

export function MenuPage() {
  const { outletId = '' } = useParams();
  const { client } = useSession();
  const cart = useCart();
  const outlets = useOutlets();
  const query = useMenu(outletId);
  const [customising, setCustomising] = useState<PartnerMenuItem | null>(null);
  if (!client) return <Navigate to="/setup" replace />;
  if (query.isPending) return <p className="p-4 text-muted">Loading the menu…</p>;
  if (query.isError) return <div className="p-4"><ErrorNotice error={query.error} /></div>;

  const { menu, etag, checkedAt, notModified } = query.data;
  const outletName = outlets.data?.find((o) => o.outletId === outletId)?.name ?? outletId;
  const categories = [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const add = (line: CartLine) => cart.add(line, { outletId, name: outletName });

  // The bottom padding keeps the last dish clear of the floating cart bar below `lg`.
  return (
    <div className="grid gap-5 p-4 pb-24 lg:grid-cols-[1fr_20rem] lg:pb-4">
      <div className="min-w-0 space-y-4">
        <header className="card overflow-hidden">
          <div className="relative">
            <DishImage src={outletImageFor({ name: outletName })} name={outletName} className="h-40 w-full pb-12 text-3xl" />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-navy/80 to-transparent p-4">
              <h1 className="truncate text-2xl font-bold text-white" title={outletName}>{outletName}</h1>
            </div>
          </div>
          <div className="space-y-2 p-4">
            <p className="text-sm text-muted">
              {menu.partnerPriceList ? `Prices from “${menu.partnerPriceList.name}”` : 'List prices (no partner price list)'} · {menu.currency} · {menu.pricesIncludeTax ? 'tax included' : 'tax added by the restaurant'}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted" data-testid="menu-version">
              <span className="chip">version {etag.replace(/"/g, '').slice(0, 8)}…</span>
              <span className="chip">checked {Math.max(0, Math.round((Date.now() - checkedAt) / 1000))} s ago</span>
              <span className="chip">{notModified ? 'not modified' : 'downloaded'}</span>
              <button type="button" className="btn-ghost px-2.5 py-0.5 text-xs" onClick={() => void query.refetch()}>Check for changes</button>
            </p>
          </div>
        </header>
        <CategoryTabs categories={categories} />
        {categories.map((category) => (
          <section key={category.id} id={`category-${category.id}`} className="scroll-mt-28 space-y-3">
            <h2 className="text-xl font-semibold">{category.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {category.items.map((item) => (
                <DishCard key={item.productId} item={item} onAdd={add} onCustomise={setCustomising} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="hidden lg:block">
        <div className="sticky top-20"><CartSummary /></div>
      </div>
      <CartBar />
      <ModifierSheet item={customising} onAdd={add} onClose={() => setCustomising(null)} />
    </div>
  );
}
