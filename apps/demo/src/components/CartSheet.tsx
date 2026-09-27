import { CartSummary } from './CartSummary';
import { Sheet } from './Sheet';

/** The cart as a sheet, for phones and for the Cart tab. */
export function CartSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} label="Your cart" onClose={onClose}>
      <CartSummary as="div" onNavigate={onClose} />
    </Sheet>
  );
}
