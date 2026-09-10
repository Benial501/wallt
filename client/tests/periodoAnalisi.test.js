import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import { PERIODI, getDateRange } from '../src/utils/periodoAnalisi.js';

test('la settimana va da lunedì a oggi, non agli ultimi sette giorni', () => {
  // Giovedì: l'intervallo parte dal lunedì della stessa settimana.
  assert.deepEqual(getDateRange('settimana', {}, dayjs('2026-09-10')), { da: '2026-09-07', a: '2026-09-10' });
});

test('di lunedì la settimana comincia oggi stesso', () => {
  assert.deepEqual(getDateRange('settimana', {}, dayjs('2026-09-14')), { da: '2026-09-14', a: '2026-09-14' });
});

test('la domenica appartiene ancora alla settimana iniziata il lunedì', () => {
  // È il caso che si romperebbe con la locale inglese: dayjs farebbe iniziare
  // lì una settimana nuova e il totale finirebbe nel periodo sbagliato.
  assert.equal(getDateRange('settimana', {}, dayjs('2026-09-13')).da, '2026-09-07');
});

test('la settimana a cavallo di capodanno risale all’anno precedente', () => {
  assert.equal(getDateRange('settimana', {}, dayjs('2026-01-01')).da, '2025-12-29');
});

test('gli altri periodi restano quelli di prima', () => {
  const now = dayjs('2026-09-10');
  assert.deepEqual(getDateRange('mese', {}, now), { da: '2026-09-01', a: '2026-09-10' });
  assert.deepEqual(getDateRange('trimestre', {}, now), { da: '2026-06-10', a: '2026-09-10' });
  assert.deepEqual(getDateRange('anno', {}, now), { da: '2026-01-01', a: '2026-09-10' });
});

test('custom usa le date scelte dall’utente', () => {
  const r = getDateRange('custom', { customDa: '2026-03-01', customA: '2026-03-31' }, dayjs('2026-09-10'));
  assert.deepEqual(r, { da: '2026-03-01', a: '2026-03-31' });
});

test('il selettore espone la settimana come primo periodo', () => {
  assert.deepEqual(PERIODI.map((p) => p.id), ['settimana', 'mese', 'trimestre', 'anno', 'custom']);
  assert.equal(PERIODI[0].label, 'Settimana');
});
