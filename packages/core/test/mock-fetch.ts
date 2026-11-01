export interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  init: RequestInit;
}

type Responder = (call: RecordedCall) => Response | Promise<Response>;

/**
 * A fetch that answers from a queue of responders and records each call.
 * The last responder repeats when the queue runs out.
 */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      init,
    };
    calls.push(call);
    const responder = responders.length > 1 ? responders.shift()! : responders[0]!;
    return responder(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Responder {
  return () => new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json', ...headers },
  });
}
