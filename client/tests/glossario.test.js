import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARIO, GLOSSARIO_LIST, getConcetto, etichetta } from '../src/content/glossario.js';
import { getHelpTopic } from '../src/content/helpTopics.js';

test('gli id dei concetti sono unici e coerenti con la mappa', () => {
  const ids = GLOSSARIO_LIST.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.equal(GLOSSARIO[id].id, id));
});

test('ogni concetto ha etichetta e descrizione non vuote', () => {
  GLOSSARIO_LIST.forEach((c) => {
    assert.ok(c.etichetta && c.etichetta.trim().length > 0, `etichetta mancante: ${c.id}`);
    assert.ok(c.descrizione && c.descrizione.trim().length > 0, `descrizione mancante: ${c.id}`);
  });
});

test('i quattro concetti della specifica esistono con le etichette decise', () => {
  assert.equal(etichetta('patrimonio_totale'), 'Patrimonio totale');
  assert.equal(etichetta('componente_conti'), 'Conti');
  assert.equal(etichetta('componente_investimenti'), 'Investimenti');
  assert.equal(etichetta('risultato_mese'), 'Risultato del mese');
});

test('nessun concetto usa "Disponibilita totale", riservato al blocco 6C', () => {
  GLOSSARIO_LIST.forEach((c) => {
    assert.ok(
      !/disponibilit/i.test(c.etichetta),
      `il calcolo comprende scommesse e risparmio: "${c.etichetta}" prometterebbe il falso`,
    );
  });
});

test('gli argomenti di aiuto referenziati dal glossario esistono', () => {
  GLOSSARIO_LIST.forEach((c) => {
    if (!c.topic) return;
    assert.ok(getHelpTopic(c.topic), `argomento mancante: ${c.topic} (concetto ${c.id})`);
  });
});

test('getConcetto restituisce null per un id sconosciuto', () => {
  assert.equal(getConcetto('non_esiste'), null);
  assert.equal(getConcetto(undefined), null);
  assert.equal(etichetta('non_esiste'), '');
});
