import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDA_PIANO_SMART, GUIDA_ESEMPIO, calcolaTotaleEsempio } from '../src/content/pianoSmartGuide.js';

test('la guida spiega il limite principale anche con sezioni senza paragrafi', () => {
  assert.ok(GUIDA_PIANO_SMART.flatMap((section) => section.paragraphs ?? []).some((text) => text.includes('non sposta denaro')));
});

test('la guida descrive tutte le cinque categorie', () => {
  const categories = GUIDA_PIANO_SMART.find((section) => section.id === 'piani').items;
  assert.deepEqual(categories.map((item) => item.id), ['needs', 'safety', 'goals', 'future', 'freedom']);
});

test('la guida copre i tre percorsi e conserva gli esempi senza dati personali', () => {
  const text = GUIDA_PIANO_SMART.flatMap((section) => [...(section.paragraphs ?? []), ...(section.limits ?? []), section.example ?? '']).join(' ').toLowerCase();
  for (const topic of ['liquidità', 'debiti', 'fondo di sicurezza', 'mesi civili completi', 'non stimabile', 'ricorrenze', 'non collega automaticamente', 'non garantisce']) {
    assert.ok(text.includes(topic), `manca nella guida: ${topic}`);
  }
  assert.ok(GUIDA_PIANO_SMART.some((section) => section.id === 'oggi'));
  assert.ok(GUIDA_PIANO_SMART.some((section) => section.id === 'analisi'));
  assert.ok(GUIDA_PIANO_SMART.some((section) => section.id === 'piani'));
});

test('lesempio locale torna sempre al totale dichiarato', () => {
  assert.equal(GUIDA_ESEMPIO.totale, 2000);
  assert.equal(calcolaTotaleEsempio(GUIDA_ESEMPIO.allocazioni), 2000);
  assert.equal(calcolaTotaleEsempio({ ...GUIDA_ESEMPIO.allocazioni, freedom: 450 }), 1950);
});
