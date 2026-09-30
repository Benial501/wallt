import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const soundModule = await import('../src/utils/startupSplashSound.js')
  .then((module) => module)
  .catch(() => null);

class FakeAudioParam {
  events = [];

  setValueAtTime(value, time) {
    this.events.push({ type: 'set', value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.events.push({ type: 'linear', value, time });
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push({ type: 'exponential', value, time });
  }
}

class FakeAudioNode {
  connections = [];
  disconnectCalls = 0;

  connect(destination) {
    this.connections.push(destination);
  }

  disconnect() {
    this.disconnectCalls += 1;
  }
}

class FakeOscillator extends FakeAudioNode {
  frequency = new FakeAudioParam();
  startTime;
  stopTime;
  onended;

  start(time) {
    this.startTime = time;
  }

  stop(time) {
    this.stopTime = time;
  }
}

class FakeAudioContext {
  state = 'running';
  currentTime = 12;
  destination = {};
  gains = [];
  oscillators = [];
  closeCalls = 0;
  resumeCalls = 0;
  resumeOnCall = Infinity;

  createGain() {
    const gain = new FakeAudioNode();
    gain.gain = new FakeAudioParam();
    this.gains.push(gain);
    return gain;
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  resume() {
    this.resumeCalls += 1;
    if (this.resumeCalls === this.resumeOnCall) this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

class FakeEventTarget {
  listeners = new Map();

  addEventListener(type, listener, options) {
    this.listeners.set(type, { listener, once: options?.once === true });
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type) {
    const entry = this.listeners.get(type);
    if (!entry) return;
    if (entry.once) this.listeners.delete(type);
    entry.listener();
  }
}

test('l’effetto sonoro della splash viene generato con tre note ascendenti e morbide', () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  const context = new FakeAudioContext();
  assert.equal(soundModule.scheduleStartupSplashSound(context), true);
  assert.equal(context.oscillators.length, 3);
  assert.equal(context.gains.length, 4);

  const frequencies = context.oscillators.map((oscillator) => (
    oscillator.frequency.events.find((event) => event.type === 'set').value
  ));
  assert.deepEqual(frequencies, [...frequencies].sort((a, b) => a - b));
  assert.ok(context.oscillators.every((oscillator) => oscillator.stopTime > oscillator.startTime));
  assert.ok(context.oscillators.every((oscillator) => oscillator.connections.length === 1));
  assert.equal(context.gains[0].connections[0], context.destination);

  context.oscillators.forEach((oscillator) => oscillator.onended());
  assert.equal(context.closeCalls, 1);
});

test('il primo tocco durante la splash sblocca e riproduce il suono', async () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  const context = new FakeAudioContext();
  context.state = 'suspended';
  context.resumeOnCall = 2;
  const eventTarget = new FakeEventTarget();
  let nativeCalls = 0;

  soundModule.startStartupSplashSound({
    getPlatform: () => 'web',
    nativePlugin: { playStartupSound: () => { nativeCalls += 1; } },
    createAudioContext: () => context,
    eventTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.oscillators.length, 0, 'l’autoplay iniziale è bloccato');
  assert.ok(eventTarget.listeners.has('pointerdown'), 'il gesto resta in ascolto durante la splash');

  eventTarget.dispatch('pointerdown');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.oscillators.length, 3);
  assert.equal(nativeCalls, 0, 'il browser continua a usare Web Audio');
  assert.equal(eventTarget.listeners.size, 0, 'dopo l’avvio rimuove gli ascoltatori');
  context.oscillators.forEach((oscillator) => oscillator.onended());
});

test('su iOS delega il suono al plugin nativo senza gesto né AudioContext web', async () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  const eventTarget = new FakeEventTarget();
  const calls = [];
  let audioContextCreations = 0;

  soundModule.startStartupSplashSound({
    getPlatform: () => 'ios',
    nativePlugin: {
      playStartupSound: (options) => {
        calls.push(options);
        return Promise.resolve({ started: true });
      },
    },
    createAudioContext: () => {
      audioContextCreations += 1;
      return new FakeAudioContext();
    },
    eventTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].notes, soundModule.STARTUP_SPLASH_SOUND_NOTES);
  assert.equal(calls[0].masterVolume, 0.2);
  assert.equal(audioContextCreations, 0);
  assert.equal(eventTarget.listeners.size, 0);
});

test('su Android delega il suono al plugin nativo senza gesto né AudioContext web', async () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  const eventTarget = new FakeEventTarget();
  const calls = [];
  let audioContextCreations = 0;

  soundModule.startStartupSplashSound({
    getPlatform: () => 'android',
    nativePlugin: {
      playStartupSound: (options) => {
        calls.push(options);
        return Promise.resolve({ started: true });
      },
    },
    createAudioContext: () => {
      audioContextCreations += 1;
      return new FakeAudioContext();
    },
    eventTarget,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].notes, soundModule.STARTUP_SPLASH_SOUND_NOTES);
  assert.equal(calls[0].masterVolume, 0.2);
  assert.equal(audioContextCreations, 0);
  assert.equal(eventTarget.listeners.size, 0);
});

test('un errore del plugin audio iOS non blocca l’avvio dell’app', async () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  assert.doesNotThrow(() => soundModule.startStartupSplashSound({
    getPlatform: () => 'ios',
    nativePlugin: { playStartupSound: () => Promise.reject(new Error('Audio non disponibile')) },
    eventTarget: new FakeEventTarget(),
  }));
  await new Promise((resolve) => setImmediate(resolve));
});

test('un errore del plugin audio Android non blocca l’avvio dell’app', async () => {
  assert.doesNotThrow(() => soundModule.startStartupSplashSound({
    getPlatform: () => 'android',
    nativePlugin: { playStartupSound: () => Promise.reject(new Error('Audio non disponibile')) },
    eventTarget: new FakeEventTarget(),
  }));
  await new Promise((resolve) => setImmediate(resolve));
});

test('la modalità senza animazione non avvia il plugin nativo', () => {
  let calls = 0;
  assert.doesNotThrow(() => soundModule.startStartupSplashSound({
    getPlatform: () => 'android',
    nativePlugin: { playStartupSound: () => { calls += 1; } },
    unlockWindowMs: 0,
    eventTarget: new FakeEventTarget(),
  }));
  assert.equal(calls, 0);
});

test('il plugin audio web non simula la riproduzione nativa', async () => {
  const { WalltNativeWeb } = await import('../plugins/wallt-native/web.js');
  const plugin = new WalltNativeWeb();

  assert.deepEqual(await plugin.playStartupSound(), { started: false });
});

test('App avvia il suono solo quando il movimento ridotto non è attivo', () => {
  assert.match(appSource, /import\s*\{\s*startStartupSplashSound\s*\}\s*from\s*['"]@\/utils\/startupSplashSound['"]/);
  assert.match(appSource, /if\s*\(!prefersReducedMotion\)\s*\{[\s\S]*?startStartupSplashSound\(/);
});
