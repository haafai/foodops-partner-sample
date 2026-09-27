import { Link } from 'react-router-dom';
import { estimateTotal, lineTotal } from '../cart/cart';
import { useCart } from '../cart/CartProvider';
import { dishImageFor } from '../images/catalog';
import { DishImage } from './DishImage';

export interface CartSummaryProps {
  /** `aside` for the desktop column (a landmark); `div` inside the cart sheet, which is already a dialog. */
  as?: 'aside' | 'div';
  /** Called when the checkout link is followed, so a sheet can close. */
  onNavigate?: () => void;
}

export function CartSummary({ as = 'aside', onNavigate }: CartSummaryProps) {
  const cart = useCart();
  const Wrapper = as;
  return (
    <Wrapper className="card p-4 text-sm">
      <h2 className="text-lg font-semibold">Cart{cart.outletName ? ` · ${cart.outletName}` : ''}</h2>
      {cart.lines.length === 0 && <p className="mt-2 text-muted">Nothing yet.</p>}
      <ul className="mt-3 space-y-3">
        {cart.lines.map((line) => (
          <li key={line.lineId} className="flex items-start gap-3">
            <DishImage src={dishImageFor({ name: line.itemName, imageUrl: null })} name={line.itemName} className="h-12 w-12 shrink-0 rounded-xl text-sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{line.quantity} × {line.itemName} ({line.variantName})</p>
              {line.modifiers.length > 0 && <p className="text-xs text-muted">{line.modifiers.map((m) => `${m.quantity} × ${m.name}`).join(', ')}</p>}
              {line.note && <p className="text-xs italic text-muted">{line.note}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold">{lineTotal(line).toFixed(2)}</p>
              <button type="button" className="text-xs font-semibold text-chili" onClick={() => cart.remove(line.lineId)} aria-label={`Remove ${line.itemName}`}>remove</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex justify-between border-t border-sand pt-3 text-base font-bold"><span>Estimate</span><span>{estimateTotal(cart.lines).toFixed(2)}</span></p>
      <p className="text-xs text-muted">The restaurant's total is the one that counts.</p>
      {cart.lines.length > 0 && <Link to="/checkout" onClick={onNavigate} className="btn-primary mt-4 block text-center">Go to checkout</Link>}
    </Wrapper>
  );
}
