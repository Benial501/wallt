import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDA_PIANO_SMART, GUIDA_ESEMPIO, calcolaTotaleEsempio } from '../src/content/pianoSmartGuide.js';

test('la guida contiene cinque sezioni e spiega il limite principale', () => {
  assert.equal(GUIDA_PIANO_SMART.length, 5);
  assert.ok(GUIDA_PIANO_SMART.flatMap((section) => section.paragraphs).some((text) => text.includes('non sposta denaro')));
});

test('la guida descrive tutte le cinque categorie', () => {
  const categories = GUIDA_PIANO_SMART.find((section) => section.id === 'categorie').items;
  assert.deepEqual(categories.map((item) => item.id), ['needs', 'safety', 'goals', 'future', 'freedom']);
});

test('lesempio locale torna sempre al totale dichiarato', () => {
  assert.equal(GUIDA_ESEMPIO.totale, 2000);
  assert.equal(calcolaTotaleEsempio(GUIDA_ESEMPIO.allocazioni), 2000);
  assert.equal(calcolaTotaleEsempio({ ...GUIDA_ESEMPIO.allocazioni, freedom: 450 }), 1950);
});
