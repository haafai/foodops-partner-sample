import type { CreatePartnerOrderLine, PartnerClient, PartnerMenu, PartnerMenuVariant, PartnerModifierGroup, PartnerOutlet } from '@foodops-partner/client';
import type { MockControl } from '@foodops-partner/mock-server/control-client';

/** What a scenario needs that a real API may not offer. Missing ⇒ the scenario is skipped, never failed. */
export type Capability = 'mock-control' | 'closed-outlet' | 'menu-only-key' | 'unbound-key' | 'webhook-url' | 'webhook-listener';

export interface RawInit {
  body?: unknown;
  headers?: Record<string, string>;
  /** `null` sends no Authorization header; undefined sends the context's key. */
  key?: string | null;
}

export interface ScenarioContext {
  client: PartnerClient;
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  capabilities: ReadonlySet<Capability>;
  mock?: MockControl;
  closedOutletId?: string;
  menuOnlyKey?: string;
  unboundKey?: string;
  /** A webhook URL the target will accept. Unset against the mock, where a scenario registers its own listener. */
  webhookUrl?: string;
  /** The local port a webhook scenario listens on; deliveries to `webhookUrl` must reach it. 0 means any free port. */
  webhookListenPort?: number;
  /** A bare request under the partner prefix, for cases the client refuses to send (a missing Idempotency-Key). */
  raw(method: string, path: string, init?: RawInit): Promise<Response>;
  /** A partner reference unique to this run. */
  reference(name: string): string;
  pickOutlet(): Promise<PartnerOutlet>;
  pickMenu(outletId: string): Promise<PartnerMenu>;
  /** One request made the way cleanup makes them: paced against a real API, and tried again when the failure may pass. */
  retryPaced<T>(request: () => Promise<T>): Promise<T>;
  /** Remember an order so cleanup() can cancel it. */
  track(orderId: string): void;
  cleanup(): Promise<void>;
}

export interface Scenario {
  name: string;
  requires: Capability[];
  run(ctx: ScenarioContext): Promise<void>;
}

export type ScenarioResult =
  | { name: string; outcome: 'pass' }
  | { name: string; outcome: 'fail'; message: string }
  | { name: string; outcome: 'skipped'; reason: string };

/** Throw inside run() when the target lacks something the scenario needs (an unavailable variant, say). */
export class SkipScenario extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SkipScenario';
  }
}

export type { CreatePartnerOrderLine, PartnerMenuVariant, PartnerModifierGroup };
