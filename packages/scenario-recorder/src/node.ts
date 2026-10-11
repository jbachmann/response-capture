import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest';
import { getRawRequest } from '@mswjs/interceptors';
import { ClientRequest } from 'node:http';
import { isJsonContentType } from '@response-capture/contracts/scenarios';
import type { Json, RequestExample } from '@response-capture/contracts/scenarios';
import { markedRequests } from './context.js';
import type { MarkedRequest } from './context.js';
export { withCaptureSession } from './context.js';

async function jsonBody(message: Request | Response, signal?: AbortSignal): Promise<Json> {
  const encoding = message.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity')
    throw new Error('compressed payloads are unsupported');
  const type = message.headers.get('content-type');
  if (type && !isJsonContentType(type))
    throw new Error(`content-type ${type} is unsupported; only JSON is supported`);
  const copy = message.clone();
  if (!copy.body) return null;
  const reader = copy.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return null;
    if (!type) throw new Error('nonempty body has no JSON content type');
    return JSON.parse(text) as Json;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Install observation once per worker. No response mocking or header mutation. */
export function startHttpCapture(): () => void {
  const interceptor = new ClientRequestInterceptor();
  const exchanges = new Map<string, { marked: MarkedRequest; request?: RequestExample }>();

  function observe(marked: MarkedRequest, run: () => Promise<void>): Promise<void> {
    const promise = run().catch((error: unknown) =>
      marked.scope.session.fail(marked.definition.id, error),
    );
    marked.scope.pending.add(promise);
    void promise.then(() => marked.scope.pending.delete(promise));
    return promise;
  }

  interceptor.on('request', ({ request, requestId }) => {
    const raw = getRawRequest(request);
    if (!(raw instanceof ClientRequest)) return;
    const marked = markedRequests.get(raw);
    if (!marked) return;
    const exchange: { marked: MarkedRequest; request?: RequestExample } = { marked };
    exchanges.set(requestId, exchange);
    return observe(marked, async () => {
      if (raw.path.includes('?') || raw.path.includes('#'))
        throw new Error('query strings and fragments are unsupported');
      if (request.headers.has('transfer-encoding'))
        throw new Error('streaming request bodies are unsupported');
      const body = await jsonBody(request, marked.scope.signal);
      if (body !== null && !request.headers.has('content-length'))
        throw new Error('streaming request bodies are unsupported');
      exchange.request = {
        method: request.method as RequestExample['method'],
        path: raw.path,
        body,
      };
    });
  });
  interceptor.on('response', ({ response, requestId, isMockedResponse }) => {
    const exchange = exchanges.get(requestId);
    if (!exchange) return;
    return observe(exchange.marked, async () => {
      try {
        if (isMockedResponse)
          throw new Error('mocked responses are unsupported; capture requires a real server');
        if (!exchange.request) return;
        const body = await jsonBody(response, exchange.marked.scope.signal);
        const type = response.headers.get('content-type');
        exchange.marked.scope.session.observe(exchange.marked.definition, exchange.request, {
          status: response.status,
          ...(type ? { headers: { 'content-type': type } } : {}),
          body,
        });
      } finally {
        exchanges.delete(requestId);
      }
    });
  });
  interceptor.apply();
  return () => {
    interceptor.dispose();
    exchanges.clear();
  };
}
