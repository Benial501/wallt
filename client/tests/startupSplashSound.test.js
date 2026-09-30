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
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
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

test('l’avvio non fallisce se il browser non concede l’audio', async () => {
  assert.ok(soundModule, 'deve esistere il modulo che genera il suono');

  const context = new FakeAudioContext();
  context.state = 'suspended';
  assert.equal(await soundModule.playStartupSplashSound(() => context), false);
  assert.equal(context.oscillators.length, 0);
  assert.equal(context.closeCalls, 1);

  assert.equal(await soundModule.playStartupSplashSound(() => null), false);
});

test('App avvia il suono solo quando il movimento ridotto non è attivo', () => {
  assert.match(appSource, /import\s*\{\s*playStartupSplashSound\s*\}\s*from\s*['"]@\/utils\/startupSplashSound['"]/);
  assert.match(appSource, /if\s*\(!prefersReducedMotion\)\s*void\s+playStartupSplashSound\(\)/);
});
