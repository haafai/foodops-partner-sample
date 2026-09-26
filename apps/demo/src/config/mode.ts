import { keyEnvironment } from '@foodops-partner/client';
import { MockControl } from '@foodops-partner/mock-server/control-client';
import type { Settings } from './settings';

export type Mode = 'mock' | 'local' | 'live';

/** Mock when the simulator answers; otherwise the key decides. */
export async function detectMode(settings: Settings, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Mode> {
  if (settings.baseUrl && (await MockControl.detect(settings.baseUrl, fetchImpl))) return 'mock';
  return keyEnvironment(settings.apiKey) === 'live' ? 'live' : 'local';
}
