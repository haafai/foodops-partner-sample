import type { PartnerApiError } from '@foodops-partner/client';

const SETUP_CODES = new Set(['invalid_api_key', 'partner_key_required', 'insufficient_scope', 'endpoint_not_available', 'ip_not_allowed', 'quota_exceeded', 'auth_unavailable']);

/** One line a customer-facing app can show for each contract code. */
export function errorLine(error: PartnerApiError): string {
  switch (error.code) {
    case 'outlet_closed': return "The restaurant's till is closed. Try again when it opens.";
    case 'outlet_not_accepting': return 'The restaurant has paused online orders.';
    case 'duplicate_order': return 'This reference was already used at this restaurant today. Open the existing order.';
    case 'invalid_line': return `Line ${Number(error.details?.line ?? 0) + 1}: ${String(error.details?.reason ?? error.message)}. Refresh the menu and try again.`;
    case 'cannot_cancel': return 'The kitchen has started this order. Call the restaurant.';
    case 'idempotency_conflict': return 'This retry key was used with a different order. Start a new checkout.';
    case 'rate_limited': return `Slow down; retrying in ${error.retryAfterSeconds ?? 5} seconds.`;
    default: return SETUP_CODES.has(error.code) ? `Setup problem: ${error.code}. Check the key and contact the restaurant.` : error.message;
  }
}
