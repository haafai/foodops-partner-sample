import { useSession } from '../config/SessionProvider';

const STYLES = {
  mock: ['Mock', 'bg-emerald-100 text-emerald-900', 'Talking to the built-in mock. Nothing here is real.'],
  local: ['Local', 'bg-sky-100 text-sky-900', 'Talking to a local or test API with a test key.'],
  live: ['Live', 'bg-red-100 text-red-900', 'Talking to production with a live key. Orders here reach a real kitchen.'],
  unknown: ['Checking…', 'bg-slate-100 text-slate-700', 'Working out which API this is.'],
} as const;

export function ModeBanner() {
  const { mode } = useSession();
  const [label, classes, hint] = STYLES[mode];
  return (
    <div className={`flex items-center gap-3 px-4 py-2 text-sm ${classes}`} data-testid="mode-banner">
      <span className="rounded px-2 py-0.5 font-semibold uppercase tracking-wide">{label}</span>
      <span>{hint}</span>
    </div>
  );
}
