import { BadRequestException } from '@nestjs/common';
import { IdPipe } from './id.pipe.js';

describe('IdPipe', () => {
  const pipe = new IdPipe();
  it.each(['1', '42', '9007199254740991'])(
    'accepts positive safe ID %s',
    (value) => {
      expect(pipe.transform(value)).toBe(Number(value));
    },
  );
  it.each([
    '',
    ' ',
    '0',
    '-1',
    '1.5',
    '1e2',
    '0x10',
    '+1',
    'Infinity',
    '9007199254740992',
  ])('rejects %s', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
