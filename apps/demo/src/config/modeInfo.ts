import type { Mode } from './mode';

export interface ModeInfo {
  label: string;
  /** Tailwind classes for the pill. */
  tone: string;
  hint: string;
}

/** What each mode is called, how it is coloured, and the sentence that explains it. */
export const MODE_INFO: Record<Mode | 'unknown', ModeInfo> = {
  mock: { label: 'Mock', tone: 'bg-leaf text-white', hint: 'Talking to the built-in mock. Nothing here is real.' },
  local: { label: 'Local', tone: 'bg-navy text-white', hint: 'Talking to a local or test API with a test key.' },
  live: { label: 'Live', tone: 'bg-chili text-white', hint: 'Talking to production with a live key. Orders here reach a real kitchen.' },
  unknown: { label: 'Checking…', tone: 'bg-sand text-navy', hint: 'Working out which API this is.' },
};
