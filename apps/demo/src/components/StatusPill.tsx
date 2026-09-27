import { statusLabel, statusTone } from '../orders/statusCopy';

/** The friendly word for a status, coloured; the API's own value stays in `data-status`. */
export function StatusPill({ status }: { status: string }) {
  return <span data-status={status} className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusTone(status)}`}>{statusLabel(status)}</span>;
}
