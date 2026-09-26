import type { PartnerOutlet } from '@foodops-partner/client';
import { OUTLETS } from './fixtures';
import { json } from './http';
import type { JsonResponse } from './http';
import type { MockState } from './state';

export function handleListOutlets(state: MockState): JsonResponse {
  const outlets: PartnerOutlet[] = OUTLETS.map((o) => {
    const flags = state.outlets.get(o.outletId)!;
    return {
      outletId: o.outletId, name: o.name, address: o.address, phone: o.phone,
      acceptingOrders: flags.open && flags.acceptingOnline,
      acceptTimeoutMinutes: o.acceptTimeoutMinutes,
    };
  });
  return json(200, outlets);
}
