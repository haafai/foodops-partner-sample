import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PartnerApiError } from '@foodops-partner/client';
import { ErrorNotice } from '../src/components/ErrorNotice';

const cases: Array<[number, string, Record<string, unknown> | undefined, RegExp]> = [
  [409, 'outlet_closed', undefined, /till is closed/],
  [422, 'outlet_not_accepting', undefined, /paused online orders/],
  [409, 'duplicate_order', { orderId: 'x' }, /already used at this restaurant today/],
  [422, 'invalid_line', { line: 1, reason: 'variant unavailable' }, /Line 2: variant unavailable/],
  [409, 'cannot_cancel', undefined, /kitchen has started/],
  [409, 'idempotency_conflict', undefined, /retry key was used with a different order/],
  [429, 'rate_limited', undefined, /retrying in 7 seconds/],
  [401, 'invalid_api_key', undefined, /Setup problem: invalid_api_key/],
  [403, 'partner_key_required', undefined, /Setup problem: partner_key_required/],
  [403, 'insufficient_scope', undefined, /Setup problem: insufficient_scope/],
  [403, 'endpoint_not_available', undefined, /Setup problem: endpoint_not_available/],
  [403, 'ip_not_allowed', undefined, /Setup problem: ip_not_allowed/],
  [402, 'quota_exceeded', undefined, /Setup problem: quota_exceeded/],
  [503, 'auth_unavailable', undefined, /Setup problem: auth_unavailable/],
  [500, 'http_500', undefined, /Internal Server Error/],
];

describe('ErrorNotice', () => {
  it.each(cases)('%i %s renders its partner-facing line', (status, code, details, expected) => {
    const error = new PartnerApiError({ status, code, message: 'Internal Server Error', details, retryAfterSeconds: code === 'rate_limited' ? 7 : undefined });
    render(<ErrorNotice error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    expect(screen.getByRole('alert')).toHaveTextContent(code);
  });
  it('renders a plain error message and nothing for no error', () => {
    const { rerender } = render(<ErrorNotice error={new Error('network down')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('network down');
    rerender(<ErrorNotice error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
