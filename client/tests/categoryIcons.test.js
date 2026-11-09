import test from 'node:test';
import assert from 'node:assert/strict';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { readFileSync } from 'node:fs';
import { CATEGORY_ICON_OPTIONS, resolveCategoryIcon } from '../src/utils/categoryIcons.js';

test('ogni icona consentita dal server ha un nome italiano e produce un simbolo SVG distinto', async () => {
  const serverCatalog = JSON.parse(readFileSync(new URL('../../server/constants/categoryIcons.json', import.meta.url)));
  assert.deepEqual(CATEGORY_ICON_OPTIONS, serverCatalog);
  const rendered = new Set();
  for (const { id, label } of serverCatalog) {
    assert.ok(label.trim());
    const svg = await renderToString(createSSRApp({ render: () => h(resolveCategoryIcon(id)) }));
    assert.match(svg, /<svg/);
    assert.ok(!rendered.has(svg), `Simbolo duplicato o mancante: ${id}`);
    rendered.add(svg);
  }
});

test('un simbolo sconosciuto conserva il ripiego Etichetta', () => {
  assert.equal(resolveCategoryIcon('non-esistente'), resolveCategoryIcon('Tag'));
});
