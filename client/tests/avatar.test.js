import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_MAX_FILE_BYTES,
  validaFileImmagine,
  calcolaRitaglioQuadrato,
  avatarSorgente,
  inizialiNome,
} from '../src/utils/avatar.js';

test('accetta un file immagine di dimensione ragionevole', () => {
  const esito = validaFileImmagine({ type: 'image/jpeg', size: 2 * 1024 * 1024 });
  assert.equal(esito.valido, true);
  assert.equal(esito.errore, null);
});

test('rifiuta un file che non e un immagine', () => {
  const esito = validaFileImmagine({ type: 'application/pdf', size: 1024 });
  assert.equal(esito.valido, false);
  assert.match(esito.errore, /immagine/i);
});

test('rifiuta un SVG anche se dichiarato come immagine', () => {
  const esito = validaFileImmagine({ type: 'image/svg+xml', size: 1024 });
  assert.equal(esito.valido, false);
});

test('rifiuta un file oltre il limite di dimensione', () => {
  const esito = validaFileImmagine({ type: 'image/png', size: AVATAR_MAX_FILE_BYTES + 1 });
  assert.equal(esito.valido, false);
  assert.match(esito.errore, /grande/i);
});

test('rifiuta un file vuoto o assente', () => {
  assert.equal(validaFileImmagine(null).valido, false);
  assert.equal(validaFileImmagine({ type: 'image/png', size: 0 }).valido, false);
});

test('ritaglia al centro un immagine orizzontale', () => {
  assert.deepEqual(calcolaRitaglioQuadrato(1000, 400), { sx: 300, sy: 0, lato: 400 });
});

test('ritaglia al centro un immagine verticale', () => {
  assert.deepEqual(calcolaRitaglioQuadrato(400, 1000), { sx: 0, sy: 300, lato: 400 });
});

test('lascia intatta un immagine gia quadrata', () => {
  assert.deepEqual(calcolaRitaglioQuadrato(500, 500), { sx: 0, sy: 0, lato: 500 });
});

test('preferisce l immagine caricata alla foto Google', () => {
  const utente = { avatar_immagine: 'data:image/webp;base64,AAAA', avatar: 'https://google/foto' };
  assert.equal(avatarSorgente(utente), 'data:image/webp;base64,AAAA');
});

test('usa la foto Google quando non ci sono immagini caricate', () => {
  assert.equal(avatarSorgente({ avatar: 'https://google/foto' }), 'https://google/foto');
});

test('non restituisce nessuna immagine quando l utente non ne ha', () => {
  assert.equal(avatarSorgente({}), null);
  assert.equal(avatarSorgente(null), null);
});

test('ignora un avatar Google che non e un URL http', () => {
  assert.equal(avatarSorgente({ avatar: 'javascript:alert(1)' }), null);
});

test('costruisce le iniziali da nome e cognome', () => {
  assert.equal(inizialiNome('Mario Rossi'), 'MR');
  assert.equal(inizialiNome('Mario Rossi', 1), 'M');
  assert.equal(inizialiNome('mario'), 'M');
});

test('usa un segnaposto quando il nome manca', () => {
  assert.equal(inizialiNome(''), '?');
  assert.equal(inizialiNome(null), '?');
});
