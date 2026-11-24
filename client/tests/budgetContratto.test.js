/**
 * Il vocabolario del budget a tre voci fra client e server, verificato
 * confrontando i due file invece di fidarsi che restino allineati (stesso
 * principio di fondoEmergenzaContratto.test.js).
 *
 * `src/utils/budget.js` duplica di proposito voci, modelli e soglie di
 * `server/constants/budget.js`: il client li usa per mostrare la scelta del
 * modello e controllare un piano personalizzato prima di inviarlo, ma è il
 * server a decidere. Se una delle due parti cambia da sola, qui si rompe.
 *
 * Il lato server si legge da `constants/` e non da un service, perché questo
 * test gira nel job "Frontend (build)" della CI, dove Sequelize non è
 * installato (vedi CLAUDE.md, Regola 22).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import server from '../../server/constants/budget.js';
import serverFondo from '../../server/constants/fondoEmergenza.js';
import * as client from '../src/utils/budget.js';
import { GLOSSARIO } from '../src/content/glossario.js';

test('le costanti coincidono fra client e server', () => {
  for (const nome of ['VOCI', 'MODELLI_IDS', 'CODICI_CONSIGLIO', 'TIPI_CONTO_FUTURO', 'SOGLIE_AVVISO']) {
    assert.deepEqual([...client[nome]], [...server[nome]], nome);
  }
  assert.deepEqual(client.MODELLI_PRONTI, server.MODELLI_PRONTI);
  assert.deepEqual(client.ETICHETTE_VOCI, server.ETICHETTE_VOCI);
  assert.deepEqual(client.CATEGORIE_VOCE_FISSA, server.CATEGORIE_VOCE_FISSA);
  assert.deepEqual([...client.CATEGORIE_FUORI_VOCI], [...server.CATEGORIE_FUORI_VOCI]);
  assert.equal(client.MODELLO_PERSONALIZZATO, server.MODELLO_PERSONALIZZATO);
  assert.equal(client.SOGLIA_SPESE_FISSE_ALTE, server.SOGLIA_SPESE_FISSE_ALTE);
  assert.equal(client.MESI_SUGGERIMENTO_MODELLO, server.MESI_SUGGERIMENTO_MODELLO);
});

test('ogni modello pronto è un piano valido', () => {
  Object.values(server.MODELLI_PRONTI).forEach((p) => assert.equal(server.percentualiValide(p), true));
});

test('percentualiValide risponde uguale sui due lati', () => {
  const casi = [
    { bisogni: 50, desideri: 30, futuro: 20 }, { bisogni: 50, desideri: 30, futuro: 19 },
    { bisogni: 50.5, desideri: 29.5, futuro: 20 }, { bisogni: 101, desideri: 0, futuro: -1 },
    { bisogni: 100, desideri: 0, futuro: 0 }, { bisogni: 50, desideri: 50 }, null, {},
    { bisogni: '50', desideri: 30, futuro: 20 },
    { bisogni: 50, desideri: 30, futuro: 20, extra: 0 },
  ];
  casi.forEach((c) => assert.equal(client.percentualiValide(c), server.percentualiValide(c), JSON.stringify(c)));
  assert.equal(server.percentualiValide({ bisogni: 100, desideri: 0, futuro: 0 }), true);
  assert.equal(server.percentualiValide({ bisogni: '50', desideri: 30, futuro: 20 }), false);
  assert.equal(server.percentualiValide({ bisogni: 50, desideri: 30, futuro: 20, extra: 0 }), false);
});

test('le etichette delle voci sono quelle del glossario', () => {
  server.VOCI.forEach((v) => assert.equal(GLOSSARIO[`budget_${v}`].etichetta, server.ETICHETTE_VOCI[v]));
});

test('gli importi da attribuire hanno una voce di glossario', () => {
  assert.equal(GLOSSARIO.budget_da_attribuire.etichetta, 'Da attribuire');
});

test('una categoria fuori dalle voci non ha anche una voce fissa', () => {
  server.CATEGORIE_FUORI_VOCI.forEach((c) => assert.equal(c in server.CATEGORIE_VOCE_FISSA, false, c));
});

test('il vocabolario del server non carica nessun modulo', () => {
  const testo = readFileSync(new URL('../../server/constants/budget.js', import.meta.url), 'utf8');
  assert.equal(/require\(/.test(testo), false);
});

test('il tipo di conto del fondo è fra i conti del Futuro', () => {
  assert.ok(server.TIPI_CONTO_FUTURO.includes(serverFondo.TIPO_CONTO_FONDO));
});
