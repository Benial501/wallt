import test from 'node:test';
import assert from 'node:assert/strict';
import { lockDialogScroll } from '../src/components/common/dialogScrollLock.js';

function environment(original = null) {
  const listeners = new Map();
  const calls = [];
  let attribute = original;
  const body = {
    style: {}, getBoundingClientRect: () => ({ width: 1265 }),
    getAttribute: () => attribute,
    setAttribute: (_, value) => { attribute = value; },
    removeAttribute: () => { attribute = null; },
  };
  const root = { clientWidth: 1265, style: { scrollBehavior: 'smooth' } };
  const win = {
    scrollX: 0, scrollY: 762,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
    scrollTo: (x, y) => calls.push({ x, y, behavior: root.style.scrollBehavior }),
  };
  return { doc: { body, documentElement: root }, win, listeners, calls };
}

test('dialog keeps the existing content width and offsets a scrolled body', () => {
  const { doc, win } = environment();
  const release = lockDialogScroll(doc, win);
  assert.equal(doc.body.style.width, '1265px');
  assert.equal(doc.body.style.top, '-762px');
  assert.equal(doc.body.style.position, 'fixed');
  assert.equal(doc.body.style.overflow, 'hidden');
  release();
});

test('close/unmount restores original styles and scroll once, without smooth scrolling', () => {
  for (const original of [null, 'color: red; overflow: auto;']) {
    const { doc, win, calls, listeners } = environment(original);
    const release = lockDialogScroll(doc, win);
    release();
    release();
    assert.equal(doc.body.getAttribute('style'), original);
    assert.deepEqual(calls, [{ x: 0, y: 762, behavior: 'auto' }]);
    assert.equal(doc.documentElement.style.scrollBehavior, 'smooth');
    assert.equal(listeners.size, 0);
  }
});

test('viewport resize keeps the locked body aligned with the document gutter', () => {
  const { doc, win, listeners } = environment();
  const release = lockDialogScroll(doc, win);
  doc.documentElement.clientWidth = 390;
  listeners.get('resize')();
  assert.equal(doc.body.style.width, '390px');
  assert.equal(doc.body.style.top, '-762px');
  release();
});
