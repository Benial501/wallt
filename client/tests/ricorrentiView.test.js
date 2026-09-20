import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSfc } from './helpers/renderVue.js';

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
  assert.match(html, /Movimento ricorrente/);
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
