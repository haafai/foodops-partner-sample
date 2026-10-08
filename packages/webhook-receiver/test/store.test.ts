import { describe, expect, it } from 'vitest';
import type { WebhookEnvelope } from '@foodops-partner/client';
import { MAX_EVENTS, MAX_SEEN_IDS, ReceiverState } from '../src/store';

const event = (n: number): WebhookEnvelope => ({ id: `evt_${n}`, type: 'order.accepted', createdAt: '2026-10-08T09:12:44Z', data: { orderId: `o${n}` } });

describe('ReceiverState', () => {
  it('numbers events in arrival order and returns only those after a given seq', () => {
    const state = new ReceiverState({ clock: () => Date.parse('2026-10-08T09:12:45Z') });
    expect(state.record(event(1))).toBe('recorded');
    expect(state.record(event(2))).toBe('recorded');
    expect(state.eventsAfter(0).map((e) => e.seq)).toEqual([1, 2]);
    expect(state.eventsAfter(1)).toEqual([{ seq: 2, receivedAt: '2026-10-08T09:12:45.000Z', event: event(2) }]);
    expect(state.eventsAfter(2)).toEqual([]);
    expect(state.lastSeq).toBe(2);
  });

  it('ignores a repeated id: nothing is recorded twice and the repeat is counted', () => {
    const state = new ReceiverState();
    state.record(event(1));
    expect(state.record({ ...event(1), type: 'order.ready' })).toBe('duplicate');
    expect(state.eventsAfter(0)).toHaveLength(1);
    expect(state.eventsAfter(0)[0].event.type).toBe('order.accepted');
    expect(state.snapshot('http://x')).toMatchObject({ received: 1, duplicates: 1 });
  });

  it('keeps the newest MAX_EVENTS events, and seq keeps counting', () => {
    const state = new ReceiverState();
    for (let n = 1; n <= MAX_EVENTS + 3; n++) state.record(event(n));
    const kept = state.eventsAfter(0);
    expect(kept).toHaveLength(MAX_EVENTS);
    expect(kept[0].seq).toBe(4);
    expect(state.lastSeq).toBe(MAX_EVENTS + 3);
  });

  it('remembers MAX_SEEN_IDS ids, oldest forgotten first', () => {
    const state = new ReceiverState();
    for (let n = 1; n <= MAX_SEEN_IDS + 1; n++) state.record(event(n));
    expect(state.record(event(MAX_SEEN_IDS + 1))).toBe('duplicate');
    expect(state.record(event(2))).toBe('duplicate');
    expect(state.record(event(1))).toBe('recorded');
  });

  it('still calls a cleared event a repeat', () => {
    const state = new ReceiverState();
    state.record(event(1));
    state.clearEvents();
    expect(state.eventsAfter(0)).toEqual([]);
    expect(state.record(event(1))).toBe('duplicate');
  });

  it('counts rejections and keeps the last reason; the snapshot never holds the secret', () => {
    const state = new ReceiverState({ secret: 'whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8', clock: () => Date.parse('2026-10-08T09:12:45Z') });
    state.reject('signature_mismatch');
    state.reject('timestamp_out_of_tolerance');
    const snapshot = state.snapshot('http://127.0.0.1:4020/webhooks/foodops');
    expect(snapshot).toEqual({
      hasSecret: true, received: 0, duplicates: 0, rejected: 2, lastReceivedAt: null,
      lastRejection: { at: '2026-10-08T09:12:45.000Z', reason: 'timestamp_out_of_tolerance' }, webhookUrl: 'http://127.0.0.1:4020/webhooks/foodops',
    });
    expect(JSON.stringify(snapshot)).not.toContain('whsec_');
  });
});
