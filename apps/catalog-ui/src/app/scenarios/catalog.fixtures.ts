import type { Scenario } from '@response-capture/contracts/scenarios';

export const example = (id: string, metadata: Partial<Scenario> = {}): Scenario => ({
  schemaVersion: 1,
  id,
  request: { method: 'POST', path: '/observatories', body: { nested: [true, null] } },
  response: { status: 201, body: null },
  ...metadata,
});
export const synthetic = [
  example('z', {
    title: 'Open observatory',
    category: 'Astronomy',
    group: 'Open a station',
    tags: ['night'],
    description: 'Start observing the sky.',
  }),
  example('a', {
    title: 'Close observatory',
    category: 'Astronomy',
    group: 'Close a station',
    tags: ['night'],
  }),
  example('b', { title: 'Launch balloon', category: 'Weather', group: 'Launch', tags: ['day'] }),
  example('legacy'),
];
