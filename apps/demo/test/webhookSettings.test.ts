import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_WEBHOOK_SETTINGS, loadWebhookSettings, normaliseWebhookSettings, saveWebhookSettings, validateWebhookSettings } from '../src/webhooks/webhookSettings';

const local = { receiverUrl: 'http://127.0.0.1:4021', publicUrl: 'http://127.0.0.1:4020/webhooks/foodops' };
const tunnelled = { receiverUrl: 'http://127.0.0.1:4021', publicUrl: 'https://kaana-hooks.example.com/webhooks/foodops' };

beforeEach(() => localStorage.clear());

describe('webhook settings', () => {
  it('default to what npm run receiver listens on', () => {
    expect(loadWebhookSettings()).toEqual(local);
    expect(DEFAULT_WEBHOOK_SETTINGS).toEqual(local);
  });

  it('round-trip through localStorage, and never store anything but the two addresses', () => {
    saveWebhookSettings(tunnelled);
    expect(loadWebhookSettings()).toEqual(tunnelled);
    expect(JSON.parse(localStorage.getItem('partner-demo.webhook')!)).toEqual(tunnelled);
  });

  it('fall back to the defaults when storage holds something else', () => {
    localStorage.setItem('partner-demo.webhook', '{not json');
    expect(loadWebhookSettings()).toEqual(local);
    localStorage.setItem('partner-demo.webhook', '{"receiverUrl":7}');
    expect(loadWebhookSettings()).toEqual(local);
  });

  it('normalise by trimming, and by dropping trailing slashes from the control address only', () => {
    expect(normaliseWebhookSettings({ receiverUrl: ' http://127.0.0.1:4021// ', publicUrl: ' https://kaana-hooks.example.com/webhooks/foodops/ ' }))
      .toEqual({ receiverUrl: 'http://127.0.0.1:4021', publicUrl: 'https://kaana-hooks.example.com/webhooks/foodops/' });
  });
});

describe('validateWebhookSettings', () => {
  it('accepts the local pair against the mock, and a tunnel in any mode', () => {
    expect(validateWebhookSettings(local, 'mock')).toBeNull();
    expect(validateWebhookSettings(tunnelled, 'mock')).toBeNull();
    expect(validateWebhookSettings(tunnelled, 'local')).toBeNull();
    expect(validateWebhookSettings(tunnelled, 'live')).toBeNull();
  });

  it('refuses a local or plain-http webhook URL outside mock mode, and says to use a tunnel', () => {
    for (const mode of ['local', 'live', 'unknown'] as const) {
      expect(validateWebhookSettings(local, mode), mode).toMatch(/https URL on a public host.*tunnel/);
      expect(validateWebhookSettings({ ...tunnelled, publicUrl: 'http://kaana-hooks.example.com/webhooks/foodops' }, mode), mode).toMatch(/https/);
      expect(validateWebhookSettings({ ...tunnelled, publicUrl: 'https://localhost/webhooks/foodops' }, mode), mode).toMatch(/public host/);
    }
  });

  it('refuses a control address that is not on this machine, or is not a URL', () => {
    expect(validateWebhookSettings({ ...local, receiverUrl: 'https://kaana-hooks.example.com' }, 'mock')).toMatch(/on this machine/);
    expect(validateWebhookSettings({ ...local, receiverUrl: 'nope' }, 'mock')).toMatch(/on this machine/);
    expect(validateWebhookSettings({ ...local, receiverUrl: 'http://localhost:4021' }, 'mock')).toBeNull();
  });

  it('refuses a webhook URL that is not a URL', () => {
    expect(validateWebhookSettings({ ...local, publicUrl: '' }, 'mock')).toMatch(/not a valid URL/);
    expect(validateWebhookSettings({ ...local, publicUrl: 'ftp://kaana-hooks.example.com/x' }, 'mock')).toMatch(/not a valid URL/);
  });
});
