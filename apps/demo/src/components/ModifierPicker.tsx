import { useState } from 'react';
import type { PartnerMenuItem } from '@foodops-partner/client';
import { lineFromSelection, selectionProblem } from '../cart/cart';
import type { CartLine, ModifierSelection } from '../cart/cart';

const money = (n: number) => n.toFixed(2);
const stepper = 'h-8 w-8 rounded-full border border-sand bg-white font-bold text-navy disabled:opacity-30';

export interface ModifierPickerProps {
  item: PartnerMenuItem;
  onAdd(line: CartLine): void;
  /** Inside a sheet the sheet's own heading names the item, so the picker leaves its title out. */
  hideTitle?: boolean;
}

export function ModifierPicker({ item, onAdd, hideTitle = false }: ModifierPickerProps) {
  const [variantId, setVariantId] = useState(item.variants.find((v) => v.available)?.variantId ?? item.variants[0]?.variantId);
  const [selection, setSelection] = useState<ModifierSelection[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const variant = item.variants.find((v) => v.variantId === variantId);
  const problem = selectionProblem(item, variant, selection);
  const quantityOf = (modifierId: string) => selection.find((s) => s.modifierId === modifierId)?.quantity ?? 0;

  function change(modifierId: string, delta: number) {
    setSelection((current) => {
      // Read the quantity from `current`, not from render-time state, so two quick clicks count twice.
      const next = Math.max(0, (current.find((s) => s.modifierId === modifierId)?.quantity ?? 0) + delta);
      const others = current.filter((s) => s.modifierId !== modifierId);
      return next === 0 ? others : [...others, { modifierId, quantity: next }];
    });
  }

  function add() {
    if (!variant || problem) return;
    onAdd(lineFromSelection(item, variant, selection, quantity, note.trim()));
    setSelection([]);
    setQuantity(1);
    setNote('');
  }

  return (
    <section className="space-y-4">
      {!hideTitle && (
        <div>
          <h3 className="text-lg font-semibold">{item.name}</h3>
          {item.description && <p className="text-sm text-muted">{item.description}</p>}
        </div>
      )}
      <fieldset className="card space-y-2 p-3 text-sm">
        <legend className="sr-only">Size</legend>
        {item.variants.map((v) => (
          <label key={v.variantId} className={`flex items-center gap-2 ${v.available ? '' : 'text-muted line-through'}`}>
            <input type="radio" name={`variant-${item.productId}`} value={v.variantId} checked={variantId === v.variantId} disabled={!v.available} onChange={() => setVariantId(v.variantId)} />{' '}
            {v.name} {money(v.price)}{v.available ? '' : ' (not available)'}
          </label>
        ))}
      </fieldset>
      {item.modifierGroups.map((group) => (
        <div key={group.id} className="card p-3 text-sm">
          <p className="font-semibold">{group.name} <span className="font-normal text-muted">(choose {group.min}–{group.max})</span></p>
          <ul className="mt-2 space-y-2">
            {group.modifiers.map((m) => (
              <li key={m.modifierId} className="flex items-center gap-2">
                <span className="flex-1">{m.name} <span className="text-muted">+{money(m.price)}</span></span>
                <button type="button" aria-label={`Remove ${m.name}`} className={stepper} onClick={() => change(m.modifierId, -1)} disabled={quantityOf(m.modifierId) === 0}>−</button>
                <span aria-label={`${m.name} quantity`} className="w-5 text-center font-semibold">{quantityOf(m.modifierId)}</span>
                <button type="button" aria-label={`Add ${m.name}`} className={stepper} onClick={() => change(m.modifierId, 1)}>+</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">Qty <input type="number" min={1} max={999} className="field mt-0 w-20" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} /></label>
        <input className="field mt-0 min-w-0 flex-1" placeholder="Note for the kitchen" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {problem && <p className="text-xs font-semibold text-chili">{problem}</p>}
      <button type="button" className="btn-primary w-full" disabled={problem !== null} onClick={add} aria-label={`Add ${item.name} to cart`}>Add to cart</button>
    </section>
  );
}
