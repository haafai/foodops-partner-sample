import { useEffect, useState } from 'react';
import type { PartnerMenuItem } from '@foodops-partner/client';
import { lineFromSelection } from '../cart/cart';
import type { CartLine } from '../cart/cart';
import { dishImageFor } from '../images/catalog';
import { DishImage } from './DishImage';

export interface DishCardProps {
  item: PartnerMenuItem;
  /** One-tap add for a plain item. */
  onAdd(line: CartLine): void;
  /** Open the picker for an item with sizes or modifiers. */
  onCustomise(item: PartnerMenuItem): void;
}

export function DishCard({ item, onAdd, onCustomise }: DishCardProps) {
  const available = item.variants.filter((v) => v.available);
  const soldOut = available.length === 0;
  const plain = item.variants.length === 1 && item.modifierGroups.length === 0;
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(timer);
  }, [added]);

  function add() {
    const first = available[0];
    if (!first) return;
    if (plain) {
      onAdd(lineFromSelection(item, first, [], 1, ''));
      setAdded(true);
    } else {
      onCustomise(item);
    }
  }

  const price = soldOut ? 'Sold out' : `${item.variants.length > 1 ? 'from ' : ''}${Math.min(...available.map((v) => v.price)).toFixed(2)}`;

  return (
    <article className={`card flex gap-3 p-3 ${soldOut ? 'opacity-60' : ''}`}>
      <DishImage src={dishImageFor(item)} name={item.name} className="h-24 w-24 shrink-0 rounded-2xl text-2xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-base font-semibold" title={item.name}>{item.name}</h3>
        {item.description && <p className="line-clamp-2 text-sm text-muted">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="font-display font-semibold">{price}</p>
          {!soldOut && (
            <div className="flex items-center gap-1.5">
              {/* A plain item adds in one tap; this opens the same sheet as the others, for a quantity or a note. */}
              {plain && (
                <button type="button" onClick={() => onCustomise(item)} aria-label={`Customise ${item.name}`} title="Quantity and note"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-sand bg-white text-navy transition hover:bg-sand">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />
                  </svg>
                </button>
              )}
              <button type="button" className="btn-primary px-4 py-1.5 text-sm" onClick={add} aria-label={`Add ${item.name}`}>
                {added ? 'Added' : 'Add'}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
