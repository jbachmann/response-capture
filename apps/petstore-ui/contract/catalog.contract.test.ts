import { inject, it } from 'vitest';
import type { CatalogSnapshot } from '@response-capture/scenario-client';
import { expectations } from './expectations';
import { assertScenarioContract } from './assert-contract';

declare module 'vitest' {
  interface ProvidedContext {
    contractSnapshot: CatalogSnapshot;
  }
}

const snapshot = inject('contractSnapshot');
for (const expectation of expectations.filter(({ id }) => id.startsWith('pet.'))) {
  it(expectation.id, () => assertScenarioContract(snapshot, expectation));
}
