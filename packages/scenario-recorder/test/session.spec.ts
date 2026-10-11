import { CaptureSession } from '../src/index.js';

const request = { method: 'POST' as const, path: '/echo', body: { name: 'Milo' } };
const response = { status: 201, body: { id: 1 } };

it('snapshots metadata and observations and validates observed matching hints', () => {
  const session = new CaptureSession();
  const metadata = { tags: ['defaults'], requestMatch: { bodyContains: { name: 'Milo' } } };
  const definition = session.reserve('created', metadata);
  metadata.tags.push('later');
  const observed = structuredClone(response);
  session.observe(definition, request, observed);
  observed.body.id = 99;
  expect(session.finish()).toEqual([
    {
      schemaVersion: 1,
      id: 'created',
      tags: ['defaults'],
      request: { ...request, match: { bodyContains: { name: 'Milo' } } },
      response,
    },
  ]);
  const mismatch = new CaptureSession();
  expect(() =>
    mismatch.observe(
      mismatch.reserve('wrong', { requestMatch: { bodyContains: { name: 'Luna' } } }),
      request,
      response,
    ),
  ).toThrow(/wrong.*bodyContains/);
});

it('rejects duplicates, incomplete exchanges, invalid metadata, and sealed sessions', () => {
  const session = new CaptureSession();
  session.reserve('one');
  expect(() => session.reserve('one')).toThrow(/Duplicate.*one/);
  expect(() => session.reserve('bad', { title: ' ' })).toThrow(/title/);
  expect(() => session.finish()).toThrow(/one.*await the marked request/);
  expect(() => session.reserve('closed')).toThrow(/closed/);
});

it('fails the transaction even when an HTTP observation otherwise succeeded', () => {
  const session = new CaptureSession();
  session.observe(session.reserve('one'), request, response);
  session.fail('one', new Error('unsupported exchange'));
  expect(() => session.finish()).toThrow(/one.*unsupported exchange/);
});
