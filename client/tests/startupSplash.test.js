import test from 'node:test';
import assert from 'node:assert/strict';
import { getStartupSplashTiming } from '../src/utils/startupSplash.js';

test('la splash Vue continua la sequenza partita nel preloader HTML', () => {
  assert.deepEqual(getStartupSplashTiming(700, 0, false), {
    animationElapsedMs: 700,
    remainingMs: 1100,
    animate: true,
  });
});

test('una sequenza già finita non riparte dopo un caricamento lento', () => {
  assert.deepEqual(getStartupSplashTiming(2500, 0, false), {
    animationElapsedMs: 1800,
    remainingMs: 0,
    animate: true,
  });
});

test('il movimento ridotto salta la sequenza e chiude rapidamente la splash', () => {
  assert.deepEqual(getStartupSplashTiming(700, 0, true), {
    animationElapsedMs: 0,
    remainingMs: 80,
    animate: false,
  });
});
