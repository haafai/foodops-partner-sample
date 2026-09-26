import { FULL_KEY } from '../src/fixtures';
import type { MockServerHandle } from '../src/server';

export const P = '/api/external/v1/partner';

export interface CallOptions {
  /** `null` sends no Authorization header; undefined sends the full-access key. */
  key?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CallResult {
  status: number;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  text: string;
}

/** One real HTTP call to the in-process mock. */
export async function call(handle: MockServerHandle, method: string, path: string, options: CallOptions = {}): Promise<CallResult> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (options.key !== null) headers.authorization = `Bearer ${options.key ?? FULL_KEY}`;
  const hasBody = options.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';
  const res = await fetch(`${handle.url}${path}`, { method, headers, body: hasBody ? JSON.stringify(options.body) : undefined });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, json, text };
}
