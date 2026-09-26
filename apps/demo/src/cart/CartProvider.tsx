import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CartLine } from './cart';

export interface CartOutlet { outletId: string; name: string }

export interface CartValue {
  outletId: string | null;
  outletName: string | null;
  lines: CartLine[];
  /** Adding from a different outlet starts a new cart: one order goes to one outlet. */
  add(line: CartLine, outlet: CartOutlet): void;
  remove(lineId: string): void;
  clear(): void;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [outlet, setOutlet] = useState<CartOutlet | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback((line: CartLine, next: CartOutlet) => {
    setOutlet((current) => (current?.outletId === next.outletId ? current : next));
    setLines((current) => (outlet?.outletId === next.outletId ? [...current, line] : [line]));
  }, [outlet]);
  const remove = useCallback((lineId: string) => setLines((current) => current.filter((l) => l.lineId !== lineId)), []);
  const clear = useCallback(() => { setLines([]); setOutlet(null); }, []);

  const value = useMemo<CartValue>(() => ({ outletId: outlet?.outletId ?? null, outletName: outlet?.name ?? null, lines, add, remove, clear }), [outlet, lines, add, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}
