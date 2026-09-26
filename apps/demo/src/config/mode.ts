import { keyEnvironment } from '@foodops-partner/client';
import { MockControl } from '@foodops-partner/mock-server/control-client';
import type { Settings } from './settings';

export type Mode = 'mock' | 'local' | 'live';

/** A live key is always live, whatever the server answers. Otherwise mock when the simulator answers, else local. */
export async function detectMode(settings: Settings, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Mode> {
  if (keyEnvironment(settings.apiKey) === 'live') return 'live';
  if (settings.baseUrl && (await MockControl.detect(settings.baseUrl, fetchImpl))) return 'mock';
  return 'local';
}
