import type { WebhookEnvelope } from '@foodops-partner/client';
import type { ReceivedEvent, ReceiverSnapshot, RejectionReason } from './types';

/** How many events are kept for reading back. Older ones fall off; a real integration writes to a database. */
export const MAX_EVENTS = 500;
/** How many event ids are remembered for spotting a repeat. */
export const MAX_SEEN_IDS = 5000;

export interface ReceiverStateOptions { secret?: string | null; clock?: () => number }

/** Everything the receiver remembers. In memory: a restart forgets the secret and the events. */
export class ReceiverState {
  secret: string | null;
  readonly clock: () => number;
  duplicates = 0;
  rejected = 0;
  lastReceivedAt: string | null = null;
  lastRejection: { at: string; reason: RejectionReason } | null = null;
  #events: ReceivedEvent[] = [];
  /** A Set keeps insertion order, so the first entry is always the oldest id. */
  #seen = new Set<string>();
  #seq = 0;

  constructor(options: ReceiverStateOptions = {}) {
    this.secret = options.secret ?? null;
    this.clock = options.clock ?? (() => Date.now());
  }

  get lastSeq(): number {
    return this.#seq;
  }

  /** Keep a verified event, unless its id was seen before: the sender may repeat one, and a repeat changes nothing. */
  record(event: WebhookEnvelope): 'recorded' | 'duplicate' {
    if (this.#seen.has(event.id)) {
      this.duplicates += 1;
      return 'duplicate';
    }
    this.#seen.add(event.id);
    if (this.#seen.size > MAX_SEEN_IDS) this.#seen.delete(this.#seen.values().next().value as string);
    const receivedAt = new Date(this.clock()).toISOString();
    this.#seq += 1;
    this.#events.push({ seq: this.#seq, receivedAt, event });
    if (this.#events.length > MAX_EVENTS) this.#events.shift();
    this.lastReceivedAt = receivedAt;
    return 'recorded';
  }

  reject(reason: RejectionReason): void {
    this.rejected += 1;
    this.lastRejection = { at: new Date(this.clock()).toISOString(), reason };
  }

  eventsAfter(seq: number): ReceivedEvent[] {
    return this.#events.filter((e) => e.seq > seq);
  }

  /** Forget the kept events. The ids stay remembered: a repeat of a cleared event is still a repeat. */
  clearEvents(): void {
    this.#events = [];
  }

  snapshot(webhookUrl: string): ReceiverSnapshot {
    return {
      hasSecret: this.secret !== null, received: this.#seq, duplicates: this.duplicates, rejected: this.rejected,
      lastReceivedAt: this.lastReceivedAt, lastRejection: this.lastRejection, webhookUrl,
    };
  }
}
