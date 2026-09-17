import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUNCTIONALITY_ITEMS,
  getFunctionalityItems,
} from '../src/config/functionalityItems.js';

test('ogni funzione attiva ha metadati completi e un id univoco', () => {
  const ids = FUNCTIONALITY_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  FUNCTIONALITY_ITEMS.forEach((item) => {
    assert.ok(item.id?.trim());
    assert.ok(item.label?.trim());
    assert.ok(item.description?.trim());
    assert.ok(item.route?.startsWith('/'));
    assert.ok(item.icon?.trim());
    assert.equal(item.active, true);
  });
});

test('la voce Ricorrenti alimenta sidebar e bottom sheet', () => {
  const context = {
    canAccessScommesseFeature: true,
    canAccessInvestimentiFeature: true,
  };

  for (const placement of ['sidebar', 'sheet']) {
    const item = getFunctionalityItems(context, placement)
      .find((candidate) => candidate.id === 'ricorrenti');
    assert.equal(item?.route, '/ricorrenti');
  }
});

test('le restrizioni filtrano scommesse e investimenti dalla stessa fonte', () => {
  const items = getFunctionalityItems({
    canAccessScommesseFeature: false,
    canAccessInvestimentiFeature: false,
  }, 'sheet');

  assert.equal(items.some((item) => item.id === 'scommesse'), false);
  assert.equal(items.some((item) => item.id === 'investimenti'), false);
});

test('una voce disattivata non compare in nessuna superficie', () => {
  const disattivata = {
    id: 'futura',
    label: 'Futura',
    description: 'Non ancora disponibile',
    icon: 'aiuto',
    route: '/futura',
    placements: ['sidebar', 'sheet'],
    active: false,
  };

  const items = getFunctionalityItems({}, 'sheet', [...FUNCTIONALITY_ITEMS, disattivata]);
  assert.equal(items.some((item) => item.id === 'futura'), false);
});
