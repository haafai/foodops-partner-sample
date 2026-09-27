import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { canCancel, isTerminal } from '@foodops-partner/client';
import type { PartnerOrderStatus } from '@foodops-partner/client';
import { MockControl } from '@foodops-partner/mock-server/control-client';
import { useSession } from '../config/SessionProvider';

const REASONS = ['Item unavailable', 'Too busy', 'Closing soon', 'Other'];

/** Plays the restaurant against the mock. Never rendered outside Mock mode. */
export function SimulatorPanel({ orderId, status }: { orderId: string; status: PartnerOrderStatus }) {
  const { settings } = useSession();
  const queryClient = useQueryClient();
  const mock = useMemo(() => new MockControl(settings.baseUrl), [settings.baseUrl]);
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const [autopilot, setAutopilot] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(action: () => Promise<unknown>): Promise<boolean> {
    setProblem(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  const rejectReason = reason === 'Other' ? other.trim() || 'Other' : reason;
  const advanceable = status === 'accepted' || status === 'preparing' || status === 'ready';

  return (
    <section aria-label="Restaurant simulator" className="rounded-card border-2 border-dashed border-leaf bg-leaf/5 p-4 text-sm">
      <h2 className="text-lg font-semibold text-leaf">Restaurant simulator (mock only)</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" disabled={status !== 'pending'} onClick={() => act(() => mock.accept(orderId))}>Accept</button>
        <button type="button" className="btn-ghost" disabled={!advanceable} onClick={() => act(() => mock.advance(orderId))}>Advance</button>
        <button type="button" className="btn-ghost" disabled={status !== 'pending'} onClick={() => act(() => mock.timeout(orderId))}>Time out</button>
        <button type="button" className="btn-ghost" disabled={isTerminal(status)} onClick={() => act(() => mock.restaurantCancel(orderId, 'Kitchen closed early'))}>Restaurant cancel</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="field mt-0 w-auto" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Rejection reason">
          {REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        {reason === 'Other' && <input className="field mt-0 w-auto" placeholder="Reason" value={other} onChange={(e) => setOther(e.target.value)} />}
        <button type="button" className="btn-ghost" disabled={status !== 'pending'} onClick={() => act(() => mock.reject(orderId, rejectReason))}>Reject</button>
      </div>
      <label className="mt-3 block">
        <input type="checkbox" checked={autopilot} onChange={(e) => {
          const next = e.target.checked;
          void act(() => mock.setAutopilot(next, 5)).then((ok) => { if (ok) setAutopilot(next); });
        }} />{' '}
        Autopilot: accept new orders after 5 s and advance every 5 s
      </label>
      <p className="mt-1 text-xs text-muted">{canCancel(status) ? 'The partner may still cancel.' : 'Past the point of partner cancellation.'}</p>
      {problem && <p className="mt-1 text-xs font-semibold text-chili">{problem}</p>}
    </section>
  );
}
