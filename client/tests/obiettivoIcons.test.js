import test from 'node:test';
import assert from 'node:assert/strict';
import { Car, Target } from 'lucide-vue-next';
import {
  OBIETTIVO_ICON_OPTIONS,
  normalizeObiettivoIconId,
  resolveObiettivoIcon,
} from '../src/utils/obiettivoIcons.js';

test('normalizza le vecchie emoji negli identificatori delle icone Lucide', () => {
  assert.equal(normalizeObiettivoIconId('🚗'), 'car');
  assert.equal(normalizeObiettivoIconId('🎯'), 'target');
  assert.equal(resolveObiettivoIcon('🚗'), Car);
});

test('usa Target quando il valore salvato non corrisponde a un’icona nota', () => {
  assert.equal(normalizeObiettivoIconId('valore-sconosciuto'), 'target');
  assert.equal(resolveObiettivoIcon('valore-sconosciuto'), Target);
});

test('espone opzioni accessibili con identificatori univoci e senza emoji', () => {
  const ids = OBIETTIVO_ICON_OPTIONS.map(({ id }) => id);

  assert.ok(ids.length >= 12);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(OBIETTIVO_ICON_OPTIONS.every(({ label }) => label.length > 0));
  assert.ok(OBIETTIVO_ICON_OPTIONS.every(({ id }) => /^[a-z-]+$/.test(id)));
});
