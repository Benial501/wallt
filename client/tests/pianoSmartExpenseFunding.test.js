import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContributionPayload } from '../src/utils/expenseFunding.js';

test('il contributo invia soltanto importo e data e non supera il residuo', () => {
  assert.deepEqual(createContributionPayload(17, '30,00', '2026-10-01', '150.00'), {
    paymentId: 17, amount: '30.00', date: '2026-10-01',
  });
  for (const amount of ['', '0', '-1', '1.005', '150.01']) {
    assert.equal(createContributionPayload(17, amount, '2026-10-01', '150.00'), null);
  }
});

test('la scheda richiede una conferma esplicita e non presenta tagli percentuali', async () => {
  const component = await readFile(new URL('../src/components/piano-smart/PianoSmartExpenseFunding.vue', import.meta.url), 'utf8');
  const store = await readFile(new URL('../src/stores/scheduledPayments.store.js', import.meta.url), 'utf8');
  assert.match(component, /Sì, conferma pagamento/);
  assert.match(component, /emit\('confirm-payment', plan\.paymentId\)/);
  assert.match(component, /Non ancora/);
  assert.match(component, /suggestedMonthlyReduction/);
  const template = component.match(/<template>([\s\S]*?)<\/template>/)?.[1] || '';
  assert.doesNotMatch(template, /percentuale|%/i);
  assert.match(store, /\/programmate\/\$\{id\}\/conferma/);
  assert.match(store, /\/programmate\/\$\{id\}\/accantonamenti/);
});

test('il campo importo usa token grafici definiti e resta riconoscibile', async () => {
  const component = await readFile(new URL('../src/components/piano-smart/PianoSmartExpenseFunding.vue', import.meta.url), 'utf8');
  const tokens = await readFile(new URL('../src/assets/styles/variables.css', import.meta.url), 'utf8');
  const fieldStyle = component.match(/\.expense-funding__form input\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.match(tokens, /--bg-input:/);
  assert.match(tokens, /--border:/);
  assert.match(fieldStyle, /background:\s*var\(--bg-input\)/);
  assert.match(fieldStyle, /border:\s*1px solid var\(--border\)/);
});
