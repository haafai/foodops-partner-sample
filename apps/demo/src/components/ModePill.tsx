import { useSession } from '../config/SessionProvider';
import { MODE_INFO } from '../config/modeInfo';

/** Which API this is, as a pill. The full sentence is its title and is spelled out on the Connect page. */
export function ModePill() {
  const { mode } = useSession();
  const info = MODE_INFO[mode];
  return (
    <span data-testid="mode-banner" title={info.hint} className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${info.tone}`}>
      {info.label}
    </span>
  );
}
