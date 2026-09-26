import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePurchase } from '../src/utils/pianoSmartSimulation.js';
const situation = (forecast = '312.00', available = '395.00') => ({
  current: { availableToSpend: available, dailyLimit: '65.83', remainingDays: 6, shortfall: '0.00' },
  forecast: { endOfMonthAvailable: forecast },
});
test('acquisto: confronto prima/dopo con centesimi esatti', () => {
  const result = simulatePurchase(situation(), '150,00');
  assert.equal(result.availableAfter, 24500);
  assert.equal(result.dailyAfter, 4083);
  assert.equal(result.forecastAfter, 16200);
  assert.equal(result.impact, 'Moderato');
});
test('mantiene la previsione negativa e segnala il rischio anche dentro il limite giornaliero', () => {
  const result = simulatePurchase(situation('-20.00'), '10');
  assert.equal(result.forecastAfter, -3000);
  assert.equal(result.status, 'rischio');
});
test('acquisto oltre disponibilità mostra il deficit', () => {
  const result = simulatePurchase(situation(), '500');
  assert.equal(result.availableAfter, -10500);
  assert.equal(result.dailyAfter, 0);
  assert.equal(result.status, 'rischio');
});
test('dati mancanti non diventano zeri e importi malformati sono rifiutati', () => {
  assert.equal(simulatePurchase(situation(null), '50').forecastAfter, null);
  assert.equal(simulatePurchase(situation(null, null), '50'), null);
  for (const amount of ['', ' ', '0', '-1', '1.005', '1e2', 'Infinity']) assert.equal(simulatePurchase(situation(), amount), null);
});
test('disponibilità zero non produce impatto indefinito', () => {
  assert.equal(simulatePurchase(situation(null, '0.00'), '50').impact, 'Alto');
});
