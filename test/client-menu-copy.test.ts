/// <reference types="node" />
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { copyText } from '../src/client/menu.ts';

/** Just enough DOM for the copy fallback: a clipboard that refuses, a textarea, and execCommand. */
function fakePage(copies: boolean) {
  const g = globalThis as Record<string, unknown>;
  const saved = { navigator: g.navigator, document: g.document };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.reject(new Error('denied')) } }, configurable: true, writable: true });
  g.document = {
    createElement: () => ({ value: '', append() {}, select() {}, remove() {} }),
    body: { append() {} },
    execCommand: () => copies,
  };
  return () => {
    Object.defineProperty(globalThis, 'navigator', { value: saved.navigator, configurable: true, writable: true });
    g.document = saved.document;
  };
}

test('a copy button goes back to its own label, even when pressed again before the first press settles', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const restore = fakePage(false);
  try {
    const button = { textContent: 'Copy link' } as HTMLButtonElement;
    await copyText('https://example.test/?squad=z-abcdef', button);
    assert.equal(button.textContent, 'Copy failed');
    mock.timers.tick(500);
    // The second press reads the button while it still says "Copy failed": that must not become the label it returns to.
    await copyText('https://example.test/?squad=z-abcdef', button);
    mock.timers.tick(1600);
    assert.equal(button.textContent, 'Copy link');
    mock.timers.tick(5000);
    assert.equal(button.textContent, 'Copy link');
  } finally {
    restore();
    mock.timers.reset();
  }
});
