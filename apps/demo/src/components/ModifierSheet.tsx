import type { PartnerMenuItem } from '@foodops-partner/client';
import type { CartLine } from '../cart/cart';
import { ModifierPicker } from './ModifierPicker';
import { Sheet } from './Sheet';

/** The picker for one item, in a sheet. Open while `item` is set; adding closes it. */
export function ModifierSheet({ item, onAdd, onClose }: { item: PartnerMenuItem | null; onAdd(line: CartLine): void; onClose(): void }) {
  return (
    <Sheet open={item !== null} label={item?.name ?? ''} onClose={onClose}>
      {item && (
        <>
          {item.description && <p className="mb-3 text-sm text-muted">{item.description}</p>}
          <ModifierPicker key={item.productId} item={item} hideTitle onAdd={(line) => { onAdd(line); onClose(); }} />
        </>
      )}
    </Sheet>
  );
}
