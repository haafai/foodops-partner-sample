import { useState } from 'react';
import { estimateTotal } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { CartSheet } from './CartSheet';

/** Below the `lg` breakpoint the cart column is hidden; this bar stands in for it once the cart has a line. */
export function CartBar() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const count = cart.lines.length;
  const items = `${count} ${count === 1 ? 'item' : 'items'}`;
  const total = estimateTotal(cart.lines).toFixed(2);
  return (
    <>
      {count > 0 && (
        <button type="button" onClick={() => setOpen(true)} aria-label={`View cart, ${items}, ${total}`}
          className="btn-primary fixed inset-x-4 bottom-20 z-30 flex items-center justify-between shadow-card md:bottom-6 lg:hidden">
          <span>{items} · {total}</span>
          <span>View cart</span>
        </button>
      )}
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
