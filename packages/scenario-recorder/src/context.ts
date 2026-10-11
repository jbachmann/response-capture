import { AsyncLocalStorage } from 'node:async_hooks';
import type { CaptureDefinition, CaptureSession } from './session.js';

export interface CaptureScope {
  session: CaptureSession;
  signal?: AbortSignal;
  pending: Set<Promise<void>>;
}
export interface MarkedRequest {
  definition: CaptureDefinition;
  scope: CaptureScope;
}

export const captureContext = new AsyncLocalStorage<CaptureScope>();
export const markedRequests = new WeakMap<object, MarkedRequest>();

export async function withCaptureSession<T>(
  session: CaptureSession,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const scope: CaptureScope = { session, signal, pending: new Set() };
  return captureContext.run(scope, async () => {
    try {
      return await run();
    } finally {
      // HTTP observers swallow and buffer their errors so transport behavior
      // stays native. Drain body snapshots before handing data to the runner.
      await Promise.all(scope.pending);
    }
  });
}
