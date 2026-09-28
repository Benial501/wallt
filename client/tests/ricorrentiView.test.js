import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSfc } from './helpers/renderVue.js';

const ricorrentiView = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/views/RicorrentiView.vue'),
  'utf8',
);

test('la creazione delle programmazioni resta in alto e compatta quando ci sono voci', () => {
  const template = ricorrentiView.slice(ricorrentiView.indexOf('<template>'));
  const headerEnd = template.indexOf('</header>');
  const header = template.slice(0, headerEnd);

  assert.match(header, /<WButton[^>]*v-if="numeroElementi"[^>]*size="sm"[^>]*>\+ Nuova<\/WButton>/);
  assert.match(header, /aria-label="Crea una nuova programmazione"/);
  assert.doesNotMatch(template, /class="ricorrenti-view__aggiungi"/, 'non deve restare il riquadro grande in fondo alla lista');
  assert.match(template, /#vuoto[\s\S]*?\+ Nuova programmazione/, 'la schermata vuota mantiene l’invito completo alla creazione');
});

const movimento = {
  id: 1,
  tipo: 'uscita',
  importo: '19.90',
  descrizione: 'Telefono',
  ricorrente: true,
  ricorrente_frequenza: 'mensile',
  ricorrente_giorno: 20,
  conto: { nome: 'Carta' },
};

test('la riga ricorrente rende i campi e le azioni richiesti', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', { movimento });

  for (const testo of [
    'Telefono', 'Uscita', '19,90', 'Ogni mese', 'Prossima esecuzione',
    'Carta', 'Attiva', 'Modifica', 'Elimina',
  ]) {
    assert.match(html, new RegExp(testo));
  }
});

test('tipo e stato restano comprensibili senza affidarsi al colore', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', {
    movimento: { ...movimento, tipo: 'entrata', descrizione: '', conto: null },
  });

  assert.match(html, /Entrata<\/p>/);
  assert.match(html, /Attiva<\/span>/);
  assert.match(html, /Movimento programmato/);
  assert.match(html, /Conto non disponibile/);
});

test('le azioni emettono pulsanti nominati e raggiungibili', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', { movimento });

  assert.match(html, /<button[^>]*type="button"[^>]*>[^]*Modifica[^]*<\/button>/);
  assert.match(html, /<button[^>]*type="button"[^>]*>[^]*Elimina[^]*<\/button>/);
});

test('l importo usa la valuta scelta dall utente', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', {
    movimento,
    valuta: 'USD',
  });

  assert.match(html, /19,90[^<]*USD/);
});

test('la riga sospesa propone la ripresa e non mostra una data di esecuzione', async () => {
  const html = await renderSfc('/src/components/ricorrenti/RicorrenteItem.vue', {
    movimento: { ...movimento, stato_ricorrenza: 'sospesa' },
  });
  assert.match(html, /Sospesa/);
  assert.match(html, /Riprendi/);
  assert.doesNotMatch(html, /Prossima esecuzione/);
});
