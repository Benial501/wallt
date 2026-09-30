import { Capacitor } from '@capacitor/core';
import { WalltNative } from '@wallt/native';
import { STARTUP_SPLASH_ANIMATION_MS, STARTUP_SPLASH_EXIT_MS } from './startupSplash.js';

export const STARTUP_SPLASH_SOUND_NOTES = Object.freeze([
  Object.freeze({ frequency: 392, startMs: 80, durationMs: 1120, volume: 0.07 }),
  Object.freeze({ frequency: 523.25, startMs: 310, durationMs: 920, volume: 0.052 }),
  Object.freeze({ frequency: 659.25, startMs: 570, durationMs: 740, volume: 0.04 }),
]);

const MASTER_VOLUME = 0.2;
const STARTUP_SPLASH_SOUND_UNLOCK_WINDOW_MS = STARTUP_SPLASH_ANIMATION_MS + STARTUP_SPLASH_EXIT_MS;

function closeAudioContext(audioContext) {
  try {
    const closePromise = audioContext?.close?.();
    closePromise?.catch?.(() => {});
  } catch {
    // Un errore di chiusura audio non deve influire sull'avvio dell'app.
  }
}

function createBrowserAudioContext() {
  const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return AudioContextConstructor ? new AudioContextConstructor() : null;
}

export function scheduleStartupSplashSound(audioContext) {
  if (!audioContext || audioContext.state !== 'running') return false;

  const startAt = audioContext.currentTime + 0.04;
  const masterGain = audioContext.createGain();
  masterGain.gain.setValueAtTime(MASTER_VOLUME, startAt);
  masterGain.connect(audioContext.destination);

  let remainingOscillators = STARTUP_SPLASH_SOUND_NOTES.length;

  STARTUP_SPLASH_SOUND_NOTES.forEach((note) => {
    const oscillator = audioContext.createOscillator();
    const voiceGain = audioContext.createGain();
    const noteStart = startAt + note.startMs / 1000;
    const noteEnd = noteStart + note.durationMs / 1000;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note.frequency * 0.985, noteStart);
    oscillator.frequency.exponentialRampToValueAtTime(note.frequency, noteStart + 0.24);

    voiceGain.gain.setValueAtTime(0.0001, noteStart);
    voiceGain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.055);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(voiceGain);
    voiceGain.connect(masterGain);
    oscillator.onended = () => {
      remainingOscillators -= 1;
      if (remainingOscillators === 0) {
        masterGain.disconnect();
        closeAudioContext(audioContext);
      }
    };

    oscillator.start(noteStart);
    oscillator.stop(noteEnd);
  });

  return true;
}

export function startStartupSplashSound({
  getPlatform = () => Capacitor.getPlatform(),
  nativePlugin = WalltNative,
  createAudioContext = createBrowserAudioContext,
  eventTarget = globalThis.window,
  unlockWindowMs = STARTUP_SPLASH_SOUND_UNLOCK_WINDOW_MS,
} = {}) {
  if (unlockWindowMs <= 0) return () => {};

  let platform = 'web';
  try {
    platform = getPlatform?.() ?? 'web';
  } catch {
    // Un errore nel rilevamento della piattaforma non deve bloccare l’avvio web.
  }

  if (platform === 'ios') {
    try {
      Promise.resolve(nativePlugin?.playStartupSound?.({
        notes: STARTUP_SPLASH_SOUND_NOTES,
        masterVolume: MASTER_VOLUME,
      })).catch(() => {});
    } catch {
      // Il suono è facoltativo e non deve interferire con la navigazione.
    }

    return () => {};
  }

  let audioContext;

  try {
    audioContext = createAudioContext();
    if (!audioContext) return () => {};
  } catch {
    return () => {};
  }

  let finished = false;
  let soundScheduled = false;
  let unlockTimer;

  const removeUnlockListeners = () => {
    eventTarget?.removeEventListener?.('pointerdown', resumeAndSchedule, true);
    eventTarget?.removeEventListener?.('keydown', resumeAndSchedule, true);
    eventTarget?.removeEventListener?.('touchstart', resumeAndSchedule, true);
  };

  const finishWithoutSound = () => {
    if (finished) return;
    finished = true;
    clearTimeout(unlockTimer);
    removeUnlockListeners();
    closeAudioContext(audioContext);
  };

  const scheduleIfRunning = () => {
    if (finished || audioContext.state !== 'running') return;

    try {
      if (!scheduleStartupSplashSound(audioContext)) {
        finishWithoutSound();
        return;
      }

      soundScheduled = true;
      finished = true;
      clearTimeout(unlockTimer);
      removeUnlockListeners();
    } catch {
      finishWithoutSound();
    }
  };

  function resumeAndSchedule() {
    if (finished) return;
    if (audioContext.state === 'running') {
      scheduleIfRunning();
      return;
    }

    try {
      Promise.resolve(audioContext.resume())
        .then(scheduleIfRunning)
        .catch(() => {});
    } catch {
      // Un browser che rifiuta resume può ancora sbloccarsi al gesto successivo.
    }
  }

  eventTarget?.addEventListener?.('pointerdown', resumeAndSchedule, true);
  eventTarget?.addEventListener?.('keydown', resumeAndSchedule, true);
  eventTarget?.addEventListener?.('touchstart', resumeAndSchedule, true);
  unlockTimer = setTimeout(finishWithoutSound, unlockWindowMs);
  resumeAndSchedule();

  return () => {
    if (!soundScheduled) finishWithoutSound();
  };
}
