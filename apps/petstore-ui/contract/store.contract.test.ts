import { inject, it } from 'vitest';
import { expectations } from './expectations';
import { assertScenarioContract } from './assert-contract';

const snapshot = inject('contractSnapshot');
for (const expectation of expectations.filter(({ id }) => !id.startsWith('pet.'))) {
  it(expectation.id, () => assertScenarioContract(snapshot, expectation));
}
