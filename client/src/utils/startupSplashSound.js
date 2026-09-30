export const STARTUP_SPLASH_SOUND_NOTES = Object.freeze([
  Object.freeze({ frequency: 392, startMs: 80, durationMs: 1120, volume: 0.07 }),
  Object.freeze({ frequency: 523.25, startMs: 310, durationMs: 920, volume: 0.052 }),
  Object.freeze({ frequency: 659.25, startMs: 570, durationMs: 740, volume: 0.04 }),
]);

const MASTER_VOLUME = 0.2;
const RESUME_TIMEOUT_MS = 180;

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

function resumeAudioContext(audioContext) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), RESUME_TIMEOUT_MS);

    Promise.resolve()
      .then(() => audioContext.resume())
      .then(() => {
        clearTimeout(timeout);
        resolve(audioContext.state === 'running');
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });
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

export async function playStartupSplashSound(createAudioContext = createBrowserAudioContext) {
  let audioContext;

  try {
    audioContext = createAudioContext();
    if (!audioContext) return false;

    if (audioContext.state !== 'running' && !(await resumeAudioContext(audioContext))) {
      closeAudioContext(audioContext);
      return false;
    }

    if (scheduleStartupSplashSound(audioContext)) return true;
    closeAudioContext(audioContext);
    return false;
  } catch {
    closeAudioContext(audioContext);
    return false;
  }
}
