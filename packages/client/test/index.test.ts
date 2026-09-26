import { describe, expect, it } from 'vitest';
import { CLIENT_NAME } from '../src/index';

describe('client package', () => {
  it('loads', () => {
    expect(CLIENT_NAME).toBe('@foodops-partner/client');
  });
});
