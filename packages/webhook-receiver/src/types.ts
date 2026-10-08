import type { WebhookEnvelope, WebhookRejection } from '@foodops-partner/client';

// Types only: the browser demo imports these through the control client, so nothing here may touch Node.

export interface ReceivedEvent {
  /** 1, 2, 3… in the order this receiver accepted them. Ask for "everything after seq N". */
  seq: number;
  receivedAt: string;
  event: WebhookEnvelope;
}

/** Why a delivery was answered 401. `no_secret` means nothing has been registered with this receiver yet. */
export type RejectionReason = WebhookRejection | 'no_secret';

export interface ReceiverSnapshot {
  hasSecret: boolean;
  /** Events accepted and kept, repeats not counted. */
  received: number;
  duplicates: number;
  rejected: number;
  lastReceivedAt: string | null;
  lastRejection: { at: string; reason: RejectionReason } | null;
  /** Where this receiver listens for deliveries on this machine. */
  webhookUrl: string;
}

export interface ReceivedEventsPage {
  events: ReceivedEvent[];
  lastSeq: number;
  /** False after a restart, until a secret is handed over again: every delivery is being refused meanwhile. */
  hasSecret: boolean;
}
