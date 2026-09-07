import test from 'node:test';
import assert from 'node:assert/strict';

// `pushNotifications.js` viene importato anche dove `window` non esiste
// (test Node, SSR di un eventuale prerender): le funzioni di rilevamento
// devono degradare senza lanciare.
const { pushSupportate, statoPermesso, base64UrlToUint8Array, MESSAGGI_PUSH } =
  await import('../src/utils/pushNotifications.js');

test('pushSupportate è false quando il browser non espone le API', () => {
  assert.equal(pushSupportate(), false);
});

test('statoPermesso segnala il mancato supporto invece di lanciare', () => {
  assert.equal(statoPermesso(), 'non_supportato');
});

test('base64UrlToUint8Array converte una chiave VAPID base64url', () => {
  // `atob` non esiste come globale del browser qui: lo forniamo come fa il DOM.
  globalThis.window = { atob: (value) => Buffer.from(value, 'base64').toString('binary') };

  try {
    // "hello" in base64url, senza padding.
    const risultato = base64UrlToUint8Array('aGVsbG8');
    assert.deepEqual(Array.from(risultato), [104, 101, 108, 108, 111]);

    // I caratteri specifici di base64url (- e _) vanno tradotti in + e /.
    const conCaratteriUrl = base64UrlToUint8Array('-_8');
    assert.deepEqual(Array.from(conCaratteriUrl), [251, 255]);
  } finally {
    delete globalThis.window;
  }
});

test('ogni motivo di fallimento ha un messaggio utente in italiano', () => {
  const motivi = [
    'non_supportato',
    'permesso_negato',
    'permesso_rifiutato',
    'chiave_mancante',
    'errore_sottoscrizione',
  ];

  motivi.forEach((motivo) => {
    assert.equal(typeof MESSAGGI_PUSH[motivo], 'string');
    assert.ok(MESSAGGI_PUSH[motivo].length > 10, `messaggio troppo corto per ${motivo}`);
  });
});
