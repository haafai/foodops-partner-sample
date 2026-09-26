import { Navigate, useParams } from 'react-router-dom';
import { useCart } from '../cart/CartProvider';
import { CartSummary } from '../components/CartSummary';
import { ErrorNotice } from '../components/ErrorNotice';
import { ModifierPicker } from '../components/ModifierPicker';
import { useSession } from '../config/SessionProvider';
import { useMenu } from '../menu/useMenu';
import { useOutlets } from '../menu/useOutlets';

export function MenuPage() {
  const { outletId = '' } = useParams();
  const { client } = useSession();
  const cart = useCart();
  const outlets = useOutlets();
  const query = useMenu(outletId);
  if (!client) return <Navigate to="/setup" replace />;
  if (query.isPending) return <p className="p-4">Loading menu…</p>;
  if (query.isError) return <div className="p-4"><ErrorNotice error={query.error} /></div>;
  const { menu, etag, checkedAt, notModified } = query.data;
  const outletName = outlets.data?.find((o) => o.outletId === outletId)?.name ?? outletId;
  const categories = [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="grid gap-4 p-4 md:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold">{outletName}</h1>
          <p className="text-sm text-slate-600">
            {menu.partnerPriceList ? `Prices from “${menu.partnerPriceList.name}”` : 'List prices (no partner price list)'} · {menu.currency} · {menu.pricesIncludeTax ? 'tax included' : 'tax added by the restaurant'}
          </p>
          <p className="text-xs text-slate-500" data-testid="menu-version">
            version {etag.replace(/"/g, '').slice(0, 8)}… · checked {Math.max(0, Math.round((Date.now() - checkedAt) / 1000))} s ago · {notModified ? 'not modified' : 'downloaded'}{' '}
            <button type="button" className="underline" onClick={() => void query.refetch()}>Check for changes</button>
          </p>
        </header>
        {categories.map((category) => (
          <div key={category.id} className="space-y-2">
            <h2 className="text-lg font-medium">{category.name}</h2>
            {category.items.map((item) => (
              <ModifierPicker key={item.productId} item={item} onAdd={(line) => cart.add(line, { outletId, name: outletName })} />
            ))}
          </div>
        ))}
      </div>
      <CartSummary />
    </div>
  );
}
