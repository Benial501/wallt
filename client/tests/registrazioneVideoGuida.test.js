import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

/**
 * Il video guida della registrazione: si apre da solo alla prima visita della
 * pagina, si chiude quando si vuole e resta rivedibile dal link sotto il
 * titolo. Riusa la modale di «La tua situazione», che senza parametri deve
 * restare quella di prima.
 */

const leggi = (percorso) => readFile(new URL(percorso, import.meta.url), 'utf8');

test('la registrazione apre il suo video guida alla prima visita e lo ricorda sul dispositivo', async () => {
  const source = await leggi('../src/views/auth/RegisterView.vue');
  assert.match(source, /<SituazioneVideoGuida[\s\S]*src="\/video\/registrazione-guida\.mp4"/);
  assert.match(source, /poster="\/video\/registrazione-guida-poster\.jpg"/);
  assert.match(source, /localStorage\.getItem\(CHIAVE_VIDEO\) !== '1'/);
  assert.match(source, /localStorage\.setItem\(CHIAVE_VIDEO, '1'\)/);
  assert.match(source, /Guarda come funziona/);
});

test('il video e la copertina della registrazione sono nella cartella pubblica, con un peso da app', async () => {
  const video = await stat(new URL('../public/video/registrazione-guida.mp4', import.meta.url));
  await stat(new URL('../public/video/registrazione-guida-poster.jpg', import.meta.url));
  assert.ok(video.size < 15 * 1024 * 1024, `il video pesa ${Math.round(video.size / 1024 / 1024)} MB`);
});

test('senza parametri la modale resta il video di La tua situazione', async () => {
  const source = await leggi('../src/components/piano-smart/SituazioneVideoGuida.vue');
  assert.match(source, /default: 'Come funziona La tua situazione'/);
  assert.match(source, /default: '\/video\/situazione-guida\.mp4'/);
  assert.match(source, /<source :src="src"/);
});
