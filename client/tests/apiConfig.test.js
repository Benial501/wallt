import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiUrl } from '../src/config/normalizeApiUrl.js';

test('normalizza l’URL API eliminando gli slash finali', () => {
  assert.equal(
    normalizeApiUrl('https://wallt-api.vercel.app/api///', { isProduction: true }),
    'https://wallt-api.vercel.app/api',
  );
});

test('usa il server locale quando la variabile non è impostata', () => {
  assert.equal(normalizeApiUrl(), 'http://localhost:3000/api');
});

test('in produzione rifiuta HTTP per host non locali', () => {
  assert.throws(
    () => normalizeApiUrl('http://wallt-api.example/api', { isProduction: true }),
    /HTTPS/,
  );
});

test('accetta HTTPS in produzione e HTTP soltanto in locale', () => {
  assert.equal(
    normalizeApiUrl('https://wallt-api.example/api', { isProduction: true }),
    'https://wallt-api.example/api',
  );
  assert.equal(
    normalizeApiUrl('http://127.0.0.1:3000/api', { isProduction: true }),
    'http://127.0.0.1:3000/api',
  );
});

test('rifiuta URL con credenziali incorporate', () => {
  assert.throws(
    () => normalizeApiUrl('https://user:password@wallt-api.example/api'),
    /credenziali/,
  );
});
