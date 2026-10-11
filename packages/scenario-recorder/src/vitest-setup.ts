import { afterAll, aroundEach } from 'vitest';
import { CaptureSession } from './session.js';
import { startHttpCapture, withCaptureSession } from './node.js';
import type {} from './vitest.js';

const stop = startHttpCapture();
afterAll(stop);

aroundEach(async (runTest, context) => {
  const session = new CaptureSession();
  context.task.meta.scenarioRecorder = [];
  try {
    await withCaptureSession(session, runTest, context.signal);
    if (context.task.result?.state === 'pass' && !context.task.fails && !context.signal.aborted) {
      context.task.meta.scenarioRecorder = session.finish();
    } else {
      session.discard();
    }
  } catch (error) {
    session.discard();
    throw error;
  }
});
