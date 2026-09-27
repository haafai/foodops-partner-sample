import { PartnerApiError } from '@foodops-partner/client';
import { errorLine } from '../errors/errorText';

/** Navy text on white with a chili edge: the red is the signal, the text stays readable. */
export const NOTICE_BOX = 'rounded-xl border-l-4 border-chili bg-white p-3 text-sm text-navy shadow-card';

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof PartnerApiError) {
    return (
      <div role="alert" className={NOTICE_BOX}>
        <p className="font-semibold">{errorLine(error)}</p>
        <p className="mt-1 text-xs text-muted">{error.status} {error.code} · {error.message}</p>
      </div>
    );
  }
  return <div role="alert" className={NOTICE_BOX}>{error instanceof Error ? error.message : String(error)}</div>;
}
