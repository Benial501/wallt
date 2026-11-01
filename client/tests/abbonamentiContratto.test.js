/**
 * Il contratto degli abbonamenti fra client e server, verificato confrontando i
 * due file invece di fidarsi che restino allineati (stesso principio di
 * fondoEmergenzaContratto.test.js).
 *
 * Il modulo agganciato qui è quello senza `require`: questo test gira nel job
 * "Frontend (build)" della CI, dove `server/node_modules` non esiste.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import serverVocabolario from '../../server/constants/abbonamenti.js';
import serverCosti from '../../server/utils/abbonamentiCosti.js';
import {
  CATALOGO_SERVIZI, GRUPPI_SERVIZI, ICONE_GENERICHE, PERIODI_MESI, DURATA_MESI_MAX, SCARTO_MASSIMO_RINCARO, STATI, ORIGINI,
  calcolaCosti, etichettaPeriodo, descriviDurata,
} from '../src/utils/abbonamenti.js';

test('periodi, durata massima, stati e origini coincidono', () => {
  assert.deepEqual([...PERIODI_MESI], [...serverVocabolario.PERIODI_MESI]);
  assert.equal(DURATA_MESI_MAX, serverVocabolario.DURATA_MESI_MAX);
  assert.equal(SCARTO_MASSIMO_RINCARO, serverVocabolario.SCARTO_MASSIMO_RINCARO);
  assert.deepEqual({ ...STATI }, { ...serverVocabolario.STATI });
  assert.deepEqual({ ...ORIGINI }, { ...serverVocabolario.ORIGINI });
});

test('il catalogo dei servizi è lo stesso sui due lati', () => {
  const soloPubblico = (voce) => ({ id: voce.id, nome: voce.nome, gruppo: voce.gruppo });
  assert.deepEqual(CATALOGO_SERVIZI.map(soloPubblico), serverVocabolario.CATALOGO_SERVIZI.map(soloPubblico));
  assert.deepEqual(GRUPPI_SERVIZI.map((g) => g.id), serverVocabolario.GRUPPI_SERVIZI);
  assert.deepEqual([...ICONE_GENERICHE].map((i) => i.id), [...serverVocabolario.ICONE_GENERICHE]);
});

test('il client non conosce gli alias: servono solo a leggere le descrizioni sul server', () => {
  assert.ok(CATALOGO_SERVIZI.every((voce) => !('alias' in voce)));
  assert.ok(serverVocabolario.CATALOGO_SERVIZI.every((voce) => voce.alias.length > 0));
});

test('i servizi citati nella richiesta sono in catalogo', () => {
  const ids = CATALOGO_SERVIZI.map((voce) => voce.id);
  ['netflix', 'prime-video', 'chatgpt', 'claude'].forEach((id) => assert.ok(ids.includes(id), `manca ${id}`));
  assert.equal(new Set(ids).size, ids.length, 'id duplicati nel catalogo');
});

test('il riquadro del modulo fa gli stessi conti del server', () => {
  // Il riquadro verde promette un numero prima del salvataggio: se divergesse,
  // la scheda mostrerebbe dopo un importo diverso da quello appena letto.
  ['13.99', '49.90', '0.99'].forEach((costo) => {
    PERIODI_MESI.forEach((periodo_mesi) => {
      [null, 1, 3, 7, 24].forEach((durata_mesi) => {
        const voce = { costo, periodo_mesi, durata_mesi };
        assert.deepEqual(calcolaCosti(voce), serverCosti.calcolaCosti(voce), JSON.stringify(voce));
      });
    });
  });
});

test('le durate si leggono senza scrivere "1 mesi"', () => {
  assert.equal(etichettaPeriodo(1), 'Ogni mese');
  assert.equal(etichettaPeriodo(3), 'Ogni 3 mesi');
  assert.equal(etichettaPeriodo(12), 'Ogni anno');
  assert.equal(descriviDurata({ periodo_mesi: 1, durata_mesi: null }), 'Ogni mese');
  assert.equal(descriviDurata({ periodo_mesi: 1, durata_mesi: 3 }), '3 mesi');
  assert.equal(descriviDurata({ periodo_mesi: 1, durata_mesi: 1 }), '1 mese');
});

test('il service degli abbonamenti legge il vocabolario dal modulo condiviso', () => {
  // Il confronto qui sopra vale solo se il server ha una sorgente sola.
  const service = readFileSync(new URL('../../server/services/abbonamenti.service.js', import.meta.url), 'utf8');
  assert.match(service, /require\('\.\.\/constants\/abbonamenti'\)/);
  assert.match(service, /require\('\.\.\/utils\/abbonamentiCosti'\)/);
});
