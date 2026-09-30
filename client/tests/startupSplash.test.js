import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStartupSplashTiming,
  STARTUP_SPLASH_ANIMATION_MS,
  STARTUP_SPLASH_EXIT_MS,
} from '../src/utils/startupSplash.js';

test('la durata complessiva della splash è di tre secondi', () => {
  assert.equal(STARTUP_SPLASH_ANIMATION_MS + STARTUP_SPLASH_EXIT_MS, 3000);
});

test('la splash Vue continua la sequenza partita nel preloader HTML', () => {
  assert.deepEqual(getStartupSplashTiming(700, 0, false), {
    animationElapsedMs: 700,
    remainingMs: 2050,
    animate: true,
  });
});

test('una sequenza già finita non riparte dopo un caricamento lento', () => {
  assert.deepEqual(getStartupSplashTiming(3500, 0, false), {
    animationElapsedMs: 2750,
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
