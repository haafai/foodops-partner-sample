import type { IncomingMessage, ServerResponse } from 'node:http';

export interface JsonResponse {
  status: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): JsonResponse {
  return { status, body, headers };
}

/** The contract's error body: `{ error, message }` plus any extra fields. */
export function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): JsonResponse {
  return { status, body: { error: code, message, ...extra }, headers };
}

export function empty(status: number, headers: Record<string, string> = {}): JsonResponse {
  return { status, headers };
}

export function text(status: number, body: string, headers: Record<string, string> = {}): JsonResponse {
  return { status, text: body, headers };
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the body once. An empty body is `undefined`; invalid JSON throws SyntaxError for the router to map. */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') return undefined;
  return JSON.parse(raw) as unknown;
}

/**
 * Sent on every response so a browser app on another origin (the demo on
 * localhost:5180) can call the mock and read the headers the client needs.
 */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key, If-None-Match',
  'access-control-expose-headers': 'ETag, Retry-After, Location, WWW-Authenticate',
  'access-control-max-age': '600',
};

export function send(res: ServerResponse, out: JsonResponse): void {
  const headers: Record<string, string> = { ...CORS_HEADERS, ...out.headers };
  let payload: string | undefined;
  if (out.text !== undefined) {
    headers['content-type'] = 'text/plain; charset=utf-8';
    payload = out.text;
  } else if (out.body !== undefined) {
    headers['content-type'] = 'application/json; charset=utf-8';
    payload = JSON.stringify(out.body);
  }
  res.writeHead(out.status, headers);
  res.end(payload);
}
