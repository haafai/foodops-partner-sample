import type { Scenario } from './scenario';
import { authMenuOnlyKey, authUnboundKey, authWrongKey } from './scenarios/auth';
import { menuEtag } from './scenarios/menu';
import { orderCancelAfterPreparing, orderCancelPending, orderCancelTwice } from './scenarios/orders-cancel';
import { orderCreate, orderDuplicateReference, orderIdempotencyKeyRequired, orderIdempotentReplay, orderPriceMismatch } from './scenarios/orders-create';
import { orderInvalidLineModifierOverMax, orderInvalidLineUnavailableVariant, orderInvalidLineUnknownVariant } from './scenarios/orders-lines';
import { orderRejectedReason, orderRetryThroughFaults, orderTimeout } from './scenarios/orders-restaurant';
import { orderForeignIds, orderOutletClosed } from './scenarios/orders-visibility';
import { outletsList } from './scenarios/outlets';

/** In the order they run: reads first, then writes, then the restaurant, then auth. */
export const ALL_SCENARIOS: Scenario[] = [
  outletsList,
  menuEtag,
  orderCreate,
  orderIdempotentReplay,
  orderIdempotencyKeyRequired,
  orderDuplicateReference,
  orderInvalidLineUnknownVariant,
  orderInvalidLineUnavailableVariant,
  orderInvalidLineModifierOverMax,
  orderPriceMismatch,
  orderOutletClosed,
  orderForeignIds,
  orderCancelPending,
  orderCancelTwice,
  orderCancelAfterPreparing,
  orderRejectedReason,
  orderTimeout,
  orderRetryThroughFaults,
  authWrongKey,
  authMenuOnlyKey,
  authUnboundKey,
];

export * from './scenario';
export { createContext } from './context';
export { runScenarios } from './runner';
export { formatJson, formatTable, summarise } from './report';
