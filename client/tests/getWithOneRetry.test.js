import test from 'node:test';
import assert from 'node:assert/strict';
import { getWithOneRetry } from '../src/utils/getWithOneRetry.js';

test('ripete una volta una lettura che fallisce con errore temporaneo del server', async () => {
  let tentativi = 0;
  const risultato = await getWithOneRetry(async () => {
    tentativi += 1;
    if (tentativi === 1) throw Object.assign(new Error('temporaneo'), { response: { status: 503 } });
    return 'dati';
  });

  assert.equal(risultato, 'dati');
  assert.equal(tentativi, 2);
});

test('non ripete errori permanenti di autenticazione o validazione', async () => {
  let tentativi = 0;
  const errore = Object.assign(new Error('non autorizzato'), { response: { status: 401 } });

  await assert.rejects(getWithOneRetry(async () => {
    tentativi += 1;
    throw errore;
  }), errore);

  assert.equal(tentativi, 1);
});

test('si ferma dopo un solo nuovo tentativo fallito', async () => {
  let tentativi = 0;
  await assert.rejects(getWithOneRetry(async () => {
    tentativi += 1;
    throw Object.assign(new Error('server non disponibile'), { response: { status: 500 } });
  }), /server non disponibile/);

  assert.equal(tentativi, 2);
});
