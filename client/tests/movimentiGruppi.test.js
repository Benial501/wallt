import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGruppi, ordinePerImporto, ORDINI_PER_IMPORTO } from '../src/utils/movimentiGruppi.js';

const unitario = (data, importo, tipo = 'uscita') => ({
  data,
  label: data,
  movimenti: [{ id: importo, importo, tipo }],
  totale_entrate_giorno: tipo === 'entrata' ? importo : 0,
  totale_uscite_giorno: tipo === 'uscita' ? importo : 0,
});

test('ordinePerImporto riconosce solo i due ordini per importo', () => {
  assert.equal(ordinePerImporto('importo_desc'), true);
  assert.equal(ordinePerImporto('importo_asc'), true);
  assert.equal(ordinePerImporto('data'), false);
  assert.equal(ordinePerImporto('caricamento'), false);
  assert.equal(ordinePerImporto(undefined), false);
  assert.deepEqual(ORDINI_PER_IMPORTO, ['importo_desc', 'importo_asc']);
});

test('senza preservaOrdine due gruppi della stessa data si fondono', () => {
  const pagina1 = [unitario('2026-09-10', 100)];
  const pagina2 = [unitario('2026-09-10', 50)];
  const risultato = mergeGruppi(pagina1, pagina2);

  assert.equal(risultato.length, 1);
  assert.equal(risultato[0].movimenti.length, 2);
  assert.equal(risultato[0].totale_uscite_giorno, 150);
});

test('con preservaOrdine i gruppi restano distinti e nell\'ordine di arrivo', () => {
  // Ordine per importo decrescente: la pagina 1 finisce a 500, la pagina 2
  // deve proseguire da 400 senza tornare a mescolarsi per data.
  const pagina1 = [unitario('d1', 900), unitario('d2', 800), unitario('d1', 700)];
  const pagina2 = [unitario('d2', 600), unitario('d1', 500), unitario('d2', 400)];

  const risultato = mergeGruppi(pagina1, pagina2, { preservaOrdine: true });

  assert.deepEqual(
    risultato.map((g) => g.movimenti[0].importo),
    [900, 800, 700, 600, 500, 400],
  );
  // Nessuna fusione: sei gruppi unitari, non tre gruppi per data.
  assert.equal(risultato.length, 6);
});

test('accumulare tre pagine con preservaOrdine mantiene l\'ordine globale', () => {
  // Riproduce il difetto: più di 100 risultati (due "carica altri") con
  // "Importo decrescente" non deve tornare ordinato per data dopo la prima
  // pagina extra.
  let accumulo = [];
  accumulo = mergeGruppi(accumulo, [unitario('d1', 900), unitario('d1', 800)], { preservaOrdine: true });
  accumulo = mergeGruppi(accumulo, [unitario('d1', 700), unitario('d2', 600)], { preservaOrdine: true });
  accumulo = mergeGruppi(accumulo, [unitario('d2', 500), unitario('d1', 400)], { preservaOrdine: true });

  assert.deepEqual(
    accumulo.map((g) => g.movimenti[0].importo),
    [900, 800, 700, 600, 500, 400],
  );
});
