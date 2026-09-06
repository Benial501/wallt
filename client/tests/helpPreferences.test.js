import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_PREFS_PREFIX,
  helpPreferencesKey,
  defaultHelpPreferences,
  readHelpPreferences,
  writeHelpPreferences,
  clearHelpPreferences,
} from '../src/utils/helpPreferences.js';

/** Storage finto in memoria, con possibilità di simulare accessi negati. */
const fakeStorage = ({ throwOnGet = false, throwOnSet = false } = {}) => {
  const data = new Map();
  return {
    data,
    getItem(key) {
      if (throwOnGet) throw new Error('storage negato');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (throwOnSet) throw new Error('quota superata');
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
};

test('la chiave è versionata e specifica per utente', () => {
  assert.equal(helpPreferencesKey(42), `${HELP_PREFS_PREFIX}42`);
  assert.equal(helpPreferencesKey('42'), helpPreferencesKey(42));
  assert.equal(helpPreferencesKey(null), null);
  assert.equal(helpPreferencesKey(undefined), null);
  assert.equal(helpPreferencesKey('   '), null);
});

test('di default il riquadro Primi passi è visibile', () => {
  const storage = fakeStorage();
  assert.deepEqual(defaultHelpPreferences(), { gettingStartedHidden: false });
  assert.deepEqual(readHelpPreferences(1, storage), { gettingStartedHidden: false });
});

test('nascondi e riattiva sopravvivono a una rilettura', () => {
  const storage = fakeStorage();

  assert.equal(writeHelpPreferences(7, { gettingStartedHidden: true }, storage), true);
  assert.deepEqual(readHelpPreferences(7, storage), { gettingStartedHidden: true });

  assert.equal(writeHelpPreferences(7, { gettingStartedHidden: false }, storage), true);
  assert.deepEqual(readHelpPreferences(7, storage), { gettingStartedHidden: false });
});

test('le preferenze di due account non si mescolano', () => {
  const storage = fakeStorage();

  writeHelpPreferences('utenteA', { gettingStartedHidden: true }, storage);

  assert.deepEqual(readHelpPreferences('utenteA', storage), { gettingStartedHidden: true });
  assert.deepEqual(readHelpPreferences('utenteB', storage), { gettingStartedHidden: false });

  // Ripulire un account non tocca l'altro.
  writeHelpPreferences('utenteB', { gettingStartedHidden: true }, storage);
  clearHelpPreferences('utenteB', storage);

  assert.deepEqual(readHelpPreferences('utenteA', storage), { gettingStartedHidden: true });
  assert.deepEqual(readHelpPreferences('utenteB', storage), { gettingStartedHidden: false });
});

test('contenuto corrotto o di tipo inatteso torna ai default senza lanciare', () => {
  const storage = fakeStorage();
  const key = helpPreferencesKey(3);

  for (const corrotto of ['{non json', 'null', '"stringa"', '[1,2,3]', '42']) {
    storage.data.set(key, corrotto);
    assert.deepEqual(readHelpPreferences(3, storage), { gettingStartedHidden: false });
  }

  // Valore non booleano: normalizzato, non propagato così com'è.
  storage.data.set(key, JSON.stringify({ gettingStartedHidden: 'si' }));
  assert.deepEqual(readHelpPreferences(3, storage), { gettingStartedHidden: false });
});

test('storage assente o negato non blocca la lettura né la scrittura', () => {
  assert.deepEqual(readHelpPreferences(1, null), { gettingStartedHidden: false });
  assert.equal(writeHelpPreferences(1, { gettingStartedHidden: true }, null), false);
  assert.equal(clearHelpPreferences(1, null), false);

  const negato = fakeStorage({ throwOnGet: true, throwOnSet: true });
  assert.deepEqual(readHelpPreferences(1, negato), { gettingStartedHidden: false });
  assert.equal(writeHelpPreferences(1, { gettingStartedHidden: true }, negato), false);
});

test('senza identità risolta non viene scritto nulla', () => {
  const storage = fakeStorage();

  assert.equal(writeHelpPreferences(null, { gettingStartedHidden: true }, storage), false);
  assert.equal(writeHelpPreferences(undefined, { gettingStartedHidden: true }, storage), false);
  assert.equal(storage.data.size, 0);
});

test('viene salvato solo il flag previsto', () => {
  const storage = fakeStorage();
  writeHelpPreferences(9, { gettingStartedHidden: true, token: 'segreto', saldo: 1234 }, storage);

  const salvato = JSON.parse(storage.data.get(helpPreferencesKey(9)));
  assert.deepEqual(salvato, { gettingStartedHidden: true });
});
