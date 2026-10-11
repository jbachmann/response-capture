import type { Test } from 'supertest';
import type { CaptureDefinition, CaptureMetadata } from './session.js';
import { captureContext, markedRequests } from './context.js';

/** A native Supertest plugin. Outside a capture session it is entirely inert. */
export function capture(id: string, metadata: CaptureMetadata = {}): (test: Test) => void {
  return (test) => {
    const scope = captureContext.getStore();
    if (!scope) return;
    let definition: CaptureDefinition;
    try {
      definition = scope.session.reserve(id, metadata);
    } catch (error) {
      scope.session.fail(id, error);
      throw error;
    }
    const end = test.end;
    test.end = function (callback) {
      return end.call(this, (error, response) => {
        if (error) scope.session.fail(id, error);
        callback?.(error, response);
      });
    };
    let exchanges = 0;
    test.on('request', () => {
      if (++exchanges > 1)
        scope.session.fail(id, 'HTTP retries and followed redirects are unsupported');
      markedRequests.set(test.req, { definition, scope });
    });
    test.on('redirect', () => scope.session.fail(id, 'followed redirects are unsupported'));
    test.on('response', (response) => {
      if (response.buffered === false)
        scope.session.fail(id, 'unbuffered responses are unsupported');
    });
    // Guard only this opted-in instance; preserve its native identity and methods.
    // Other requests (including ordinary runs) are never decorated.
    for (const method of ['write', 'pipe', 'attach', 'field', 'http2'] as const) {
      const original = test[method] as (...args: unknown[]) => unknown;
      Object.defineProperty(test, method, {
        configurable: true,
        value: function (...args: unknown[]) {
          scope.session.fail(id, `${method}() is unsupported for JSON capture`);
          return original.apply(this, args);
        },
      });
    }
    const buffer = test.buffer;
    test.buffer = function (value = true) {
      if (!value) scope.session.fail(id, 'buffer(false) is unsupported for JSON capture');
      return buffer.call(this, value);
    };
  };
}
