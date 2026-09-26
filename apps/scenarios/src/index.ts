import type { Scenario } from './scenario';
import { authWrongKey } from './scenarios/auth';
import { menuEtag } from './scenarios/menu';
import { orderCreate } from './scenarios/orders-create';
import { outletsList } from './scenarios/outlets';

/** In the order they run. Task 9 fills in the rest of the contract. */
export const ALL_SCENARIOS: Scenario[] = [
  outletsList,
  menuEtag,
  orderCreate,
  authWrongKey,
];

export * from './scenario';
export { createContext } from './context';
export { runScenarios } from './runner';
export { formatJson, formatTable, summarise } from './report';
