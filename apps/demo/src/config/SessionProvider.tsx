import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { PartnerClient } from '@foodops-partner/client';
import { detectMode } from './mode';
import type { Mode } from './mode';
import { loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';

export interface SessionValue {
  settings: Settings;
  mode: Mode | 'unknown';
  client: PartnerClient | null;
  update(next: Settings): void;
}

export interface SessionInitial {
  settings?: Settings;
  mode?: Mode;
  /** Tests inject a fake client; `null` means "no key yet". */
  client?: PartnerClient | null;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: SessionInitial }) {
  const [settings, setSettings] = useState<Settings>(() => initial?.settings ?? loadSettings());
  const [mode, setMode] = useState<Mode | 'unknown'>(initial?.mode ?? 'unknown');
  const client = useMemo(() => {
    if (initial && 'client' in initial) return initial.client ?? null;
    return settings.apiKey ? new PartnerClient({ baseUrl: settings.baseUrl, apiKey: settings.apiKey }) : null;
  }, [initial, settings]);

  useEffect(() => {
    if (initial?.mode) return;
    let cancelled = false;
    void detectMode(settings).then((detected) => { if (!cancelled) setMode(detected); });
    return () => { cancelled = true; };
  }, [initial?.mode, settings]);

  const update = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const value = useMemo<SessionValue>(() => ({ settings, mode, client, update }), [settings, mode, client, update]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
