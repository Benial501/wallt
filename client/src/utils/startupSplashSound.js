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

// WebKit considera l'uscita audio sbloccata solo dopo che una sorgente è
// partita davvero dentro il gesto: il solo resume() non basta e lascia muto
// il primo tocco. Un buffer di un campione è inudibile e fa da chiave.
function playSilentTick(audioContext) {
  try {
    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate || 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
  } catch {
    // Un browser senza buffer source resta comunque sbloccabile con resume.
  }
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
  createAudioContext = createBrowserAudioContext,
  eventTarget = globalThis.window,
  unlockWindowMs = STARTUP_SPLASH_SOUND_UNLOCK_WINDOW_MS,
} = {}) {
  if (unlockWindowMs <= 0) return () => {};

  const openAudioContext = () => {
    try {
      return createAudioContext() || null;
    } catch {
      return null;
    }
  };

  let audioContext = openAudioContext();
  if (!audioContext) return () => {};

  let finished = false;
  let soundScheduled = false;
  let reopenedInGesture = false;
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

  // Su iOS un contesto creato prima del gesto resta muto anche dopo resume():
  // il primo tocco ne apre uno nuovo, perché è l'unico istante in cui WebKit
  // concede davvero l'uscita audio. Altrove il contesto iniziale basta.
  const reopenInGesture = () => {
    if (reopenedInGesture) return;
    reopenedInGesture = true;

    const previous = audioContext;
    const fresh = openAudioContext();
    if (!fresh || fresh === previous) return;

    audioContext = fresh;
    closeAudioContext(previous);
  };

  const unlock = (fromGesture) => {
    if (finished) return;

    if (fromGesture && audioContext.state !== 'running') {
      reopenInGesture();
      playSilentTick(audioContext);
    }

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
  };

  function resumeAndSchedule() {
    unlock(true);
  }

  eventTarget?.addEventListener?.('pointerdown', resumeAndSchedule, true);
  eventTarget?.addEventListener?.('keydown', resumeAndSchedule, true);
  eventTarget?.addEventListener?.('touchstart', resumeAndSchedule, true);
  unlockTimer = setTimeout(finishWithoutSound, unlockWindowMs);
  unlock(false);

  return () => {
    if (!soundScheduled) finishWithoutSound();
  };
}
