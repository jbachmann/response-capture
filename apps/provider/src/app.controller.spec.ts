import { AppController } from './app.controller.js';

describe('AppController', () => {
  it('returns the root greeting', () => {
    expect(new AppController().getHello()).toBe('Hello World!');
  });
});
