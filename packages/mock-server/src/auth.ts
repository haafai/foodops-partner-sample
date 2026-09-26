import type { IncomingMessage } from 'node:http';
import { MOCK_KEYS } from './fixtures';
import type { MockKey, Scope } from './fixtures';
import { error } from './http';
import type { JsonResponse } from './http';

export type AuthResult = { ok: true; key: MockKey } | { ok: false; response: JsonResponse };

const unauthorised = (): JsonResponse =>
  error(401, 'invalid_api_key', 'The API key is missing, malformed, revoked or for another environment.', {}, { 'www-authenticate': 'Bearer' });

/**
 * Mirrors the real pipeline: the key is recognised, the scope is checked, and only then the partner binding.
 * A key in the query string is refused even when a valid header is present: keys travel in the header only.
 */
export function authenticate(req: IncomingMessage, url: URL, scope: Scope): AuthResult {
  if (url.searchParams.has('access_token')) return { ok: false, response: unauthorised() };
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  if (!match) return { ok: false, response: unauthorised() };
  const key = MOCK_KEYS.find((k) => k.key === match[1]);
  if (!key) return { ok: false, response: unauthorised() };
  if (!key.scopes.includes(scope)) return { ok: false, response: error(403, 'insufficient_scope', `This key does not carry the ${scope} scope.`) };
  if (!key.partnerBound) return { ok: false, response: error(403, 'partner_key_required', 'This key is not bound to a delivery partner.') };
  return { ok: true, key };
}
