export interface RecordedCall { url: string; init: RequestInit }

/** A fetch double that records every call and answers with whatever the handler returns. */
export function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
  return { fn, calls, header: (i: number, name: string) => new Headers(calls[i]?.init.headers).get(name) };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
