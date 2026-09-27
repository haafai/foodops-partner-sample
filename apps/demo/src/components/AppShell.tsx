import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useMatch } from 'react-router-dom';
import { useCart } from '../cart/CartProvider';
import { useOutlets } from '../menu/useOutlets';
import { CartSheet } from './CartSheet';
import { ModePill } from './ModePill';
import { Wordmark } from './Wordmark';

const icon = 'h-5 w-5';
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const HomeIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className={icon} {...stroke}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></svg>;
const OrdersIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className={icon} {...stroke}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></svg>;
const CartIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className={icon} {...stroke}><path d="M5 8h14l-1.2 11H6.2Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
const SetupIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className={icon} {...stroke}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>;

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 px-3 py-2 text-xs font-semibold md:flex-none md:flex-row md:gap-1.5 md:text-sm ${
    isActive ? 'text-navy underline decoration-mustard decoration-4 underline-offset-8' : 'text-muted'
  }`;

/** The frame every page sits in: a top bar, and one navigation that is a tab bar on phones. */
export function AppShell({ children }: { children: ReactNode }) {
  const cart = useCart();
  const outlets = useOutlets();
  const location = useLocation();
  const menuMatch = useMatch('/outlets/:outletId/menu');
  const [cartOpen, setCartOpen] = useState(false);
  // A new page starts at its top, with the cart closed.
  useEffect(() => {
    setCartOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const outletName = menuMatch
    ? outlets.data?.find((o) => o.outletId === menuMatch.params.outletId)?.name ?? null
    : location.pathname === '/checkout' ? cart.outletName : null;
  const count = cart.lines.length;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      {/* No filter, backdrop filter or transform on the header: any of them would make it the containing block
          of the fixed tab bar inside it, and the bar would land on the header instead of the bottom of the screen. */}
      <header className="sticky top-0 z-40 border-b border-sand bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link to="/outlets" aria-label="Kaana home"><Wordmark /></Link>
          {outletName && <span className="chip min-w-0 truncate" data-testid="outlet-chip" title={outletName}>{outletName}</span>}
          <span className="flex-1" />
          <ModePill />
          <nav aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sand bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0">
            <NavLink to="/outlets" className={tab}><HomeIcon />Home</NavLink>
            <NavLink to="/orders" className={tab}><OrdersIcon />Orders</NavLink>
            <button type="button" className={tab({ isActive: cartOpen })} onClick={() => setCartOpen(true)}
              aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart'}>
              <span className={`relative ${count > 0 ? 'md:mr-2.5' : ''}`}>
                <CartIcon />
                {count > 0 && <span data-testid="cart-badge" className="absolute -right-2.5 -top-1.5 rounded-full bg-mustard px-1.5 text-[10px] font-bold text-navy">{count}</span>}
              </span>
              Cart
            </button>
            <NavLink to="/setup" className={tab}><SetupIcon />Setup</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl">{children}</main>
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
