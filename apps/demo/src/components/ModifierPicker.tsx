import { useState } from 'react';
import type { PartnerMenuItem } from '@foodops-partner/client';
import { lineFromSelection, selectionProblem } from '../cart/cart';
import type { CartLine, ModifierSelection } from '../cart/cart';

const money = (n: number) => n.toFixed(2);

export function ModifierPicker({ item, onAdd }: { item: PartnerMenuItem; onAdd(line: CartLine): void }) {
  const [variantId, setVariantId] = useState(item.variants.find((v) => v.available)?.variantId ?? item.variants[0]?.variantId);
  const [selection, setSelection] = useState<ModifierSelection[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const variant = item.variants.find((v) => v.variantId === variantId);
  const problem = selectionProblem(item, variant, selection);
  const quantityOf = (modifierId: string) => selection.find((s) => s.modifierId === modifierId)?.quantity ?? 0;

  function change(modifierId: string, delta: number) {
    setSelection((current) => {
      const next = Math.max(0, quantityOf(modifierId) + delta);
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
    <section className="rounded border bg-white p-3">
      <h3 className="font-medium">{item.name}</h3>
      {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
      <fieldset className="mt-2 flex flex-wrap gap-3 text-sm">
        {item.variants.map((v) => (
          <label key={v.variantId} className={v.available ? '' : 'text-slate-400 line-through'}>
            <input type="radio" name={`variant-${item.productId}`} value={v.variantId} checked={variantId === v.variantId} disabled={!v.available} onChange={() => setVariantId(v.variantId)} />{' '}
            {v.name} {money(v.price)}{v.available ? '' : ' (not available)'}
          </label>
        ))}
      </fieldset>
      {item.modifierGroups.map((group) => (
        <div key={group.id} className="mt-2 text-sm">
          <p className="font-medium">{group.name} <span className="font-normal text-slate-500">(choose {group.min}–{group.max})</span></p>
          <ul className="mt-1 space-y-1">
            {group.modifiers.map((m) => (
              <li key={m.modifierId} className="flex items-center gap-2">
                <span className="flex-1">{m.name} <span className="text-slate-500">+{money(m.price)}</span></span>
                <button type="button" aria-label={`Remove ${m.name}`} className="rounded border px-2" onClick={() => change(m.modifierId, -1)} disabled={quantityOf(m.modifierId) === 0}>−</button>
                <span aria-label={`${m.name} quantity`}>{quantityOf(m.modifierId)}</span>
                <button type="button" aria-label={`Add ${m.name}`} className="rounded border px-2" onClick={() => change(m.modifierId, 1)}>+</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <label>Qty <input type="number" min={1} max={999} className="w-16 rounded border px-1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} /></label>
        <input className="flex-1 rounded border px-2 py-1" placeholder="Note for the kitchen" value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-40" disabled={problem !== null} onClick={add} aria-label={`Add ${item.name} to cart`}>Add to cart</button>
      </div>
      {problem && <p className="mt-1 text-xs text-amber-700">{problem}</p>}
    </section>
  );
}
