import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  /** The dialog's accessible name and its visible heading. */
  label: string;
  onClose(): void;
  children: ReactNode;
}

/** A bottom sheet on phones and a centred dialog from the `md` breakpoint. Controlled by its owner. */
export function Sheet({ open, label, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  // The latest onClose without making it an effect dependency: owners pass a new function every render,
  // and re-running the effect would move the focus while the user is typing.
  const latestClose = useRef(onClose);
  useEffect(() => { latestClose.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latestClose.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

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
