import { PartnerApiError } from '@foodops-partner/client';
import { errorLine } from '../errors/errorText';

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const box = 'rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900';
  if (error instanceof PartnerApiError) {
    return (
      <div role="alert" className={box}>
        <p className="font-medium">{errorLine(error)}</p>
        <p className="mt-1 text-xs opacity-75">{error.status} {error.code} · {error.message}</p>
      </div>
    );
  }
  return <div role="alert" className={box}>{error instanceof Error ? error.message : String(error)}</div>;
}
