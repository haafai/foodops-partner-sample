import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  /** The dialog's accessible name and its visible heading. */
  label: string;
  onClose(): void;
  children: ReactNode;
}

/** The sheets that are open, oldest first. The last one is on top: only it answers the keyboard. */
const openSheets: string[] = [];
/** What the page's overflow was before the first sheet locked it. */
let overflowBefore = '';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A bottom sheet on phones and a centred dialog from the `md` breakpoint. Controlled by its owner. */
export function Sheet({ open, label, onClose, children }: SheetProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose without making it an effect dependency: owners pass a new function every render,
  // and re-running the effect would move the focus while the user is typing.
  const latestClose = useRef(onClose);
  useEffect(() => { latestClose.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // One lock for however many sheets: the first to open takes it, the last to close gives it back.
    if (openSheets.length === 0) {
      overflowBefore = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openSheets.push(id);
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (openSheets[openSheets.length - 1] !== id) return;
      if (event.key === 'Escape') {
        latestClose.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      // Tab stays inside the sheet: the page behind it is covered, so focus must not wander there.
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.current.focus();
        return;
      }
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && active !== panel.current && panel.current.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = openSheets.indexOf(id);
      const wasTop = at === openSheets.length - 1;
      if (at >= 0) openSheets.splice(at, 1);
      if (openSheets.length === 0) document.body.style.overflow = overflowBefore;
      // A sheet closed from underneath another leaves the focus with the one on top; an opener that is gone gets none.
      if (wasTop && opener?.isConnected) opener.focus();
    };
  }, [open, id]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div data-testid="sheet-backdrop" className="absolute inset-0 bg-navy/50" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-card bg-cream p-4 shadow-card outline-none md:max-w-lg md:rounded-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="truncate text-xl font-semibold" title={label}>{label}</h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label={`Close ${label}`}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
