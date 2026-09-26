import { describe, expect, it } from 'vitest';
import { loadSettings, normaliseBaseUrl, saveSettings, validateSettings } from '../src/config/settings';

const TEST = 'hbk_test_mockfull0001_fullscopes';
const LIVE = 'hbk_live_k3f7x2m4q6zt_abcDEF123';

describe('normaliseBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normaliseBaseUrl('  https://api.example.com/  ')).toBe('https://api.example.com');
  });
  it('strips the partner prefix when it was pasted in', () => {
    expect(normaliseBaseUrl('https://api.example.com/api/external/v1/partner/')).toBe('https://api.example.com');
    expect(normaliseBaseUrl('https://api.example.com/API/External/v1/partner')).toBe('https://api.example.com');
  });
});

describe('validateSettings', () => {
  it('accepts a test key against http and localhost', () => {
    expect(validateSettings({ baseUrl: 'http://127.0.0.1:4010', apiKey: TEST })).toBeNull();
  });
  it('accepts a live key over https against a real host', () => {
    expect(validateSettings({ baseUrl: 'https://api.example.com', apiKey: LIVE })).toBeNull();
  });
  it('blocks a live key against localhost or plain http', () => {
    expect(validateSettings({ baseUrl: 'https://localhost:8443', apiKey: LIVE })).toMatch(/live key/i);
    expect(validateSettings({ baseUrl: 'http://api.example.com', apiKey: LIVE })).toMatch(/live key/i);
  });
  it('rejects a malformed key or URL', () => {
    expect(validateSettings({ baseUrl: 'http://127.0.0.1:4010', apiKey: 'nope' })).toMatch(/hbk_test_/);
    expect(validateSettings({ baseUrl: 'not a url', apiKey: TEST })).toMatch(/URL/);
    expect(validateSettings({ baseUrl: '', apiKey: TEST })).toMatch(/base URL/i);
  });
});

describe('load and save', () => {
  it('round-trips through localStorage (URL) and sessionStorage (key)', () => {
    saveSettings({ baseUrl: 'http://127.0.0.1:4010', apiKey: TEST });
    expect(loadSettings()).toEqual({ baseUrl: 'http://127.0.0.1:4010', apiKey: TEST });
    expect(localStorage.getItem('partner-demo.baseUrl')).toBe('http://127.0.0.1:4010');
    expect(localStorage.getItem('partner-demo.apiKey')).toBeNull();
    expect(sessionStorage.getItem('partner-demo.apiKey')).toBe(TEST);
  });
});
