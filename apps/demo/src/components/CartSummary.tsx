import { Link } from 'react-router-dom';
import { estimateTotal, lineTotal } from '../cart/cart';
import { useCart } from '../cart/CartProvider';

export function CartSummary() {
  const cart = useCart();
  return (
    <aside className="rounded border bg-white p-3 text-sm">
      <h2 className="font-semibold">Cart{cart.outletName ? ` · ${cart.outletName}` : ''}</h2>
      {cart.lines.length === 0 && <p className="mt-2 text-slate-500">Nothing yet.</p>}
      <ul className="mt-2 space-y-2">
        {cart.lines.map((line) => (
          <li key={line.lineId} className="flex items-start justify-between gap-2">
            <div>
              <p>{line.quantity} × {line.itemName} ({line.variantName})</p>
              {line.modifiers.length > 0 && <p className="text-xs text-slate-500">{line.modifiers.map((m) => `${m.quantity} × ${m.name}`).join(', ')}</p>}
              {line.note && <p className="text-xs italic text-slate-500">{line.note}</p>}
            </div>
            <div className="text-right">
              <p>{lineTotal(line).toFixed(2)}</p>
              <button type="button" className="text-xs text-red-700" onClick={() => cart.remove(line.lineId)} aria-label={`Remove ${line.itemName}`}>remove</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between border-t pt-2 font-medium"><span>Estimate</span><span>{estimateTotal(cart.lines).toFixed(2)}</span></p>
      <p className="text-xs text-slate-500">The restaurant's total is the one that counts.</p>
      {cart.lines.length > 0 && <Link to="/checkout" className="mt-3 block rounded bg-slate-900 px-3 py-2 text-center text-white">Go to checkout</Link>}
    </aside>
  );
}
