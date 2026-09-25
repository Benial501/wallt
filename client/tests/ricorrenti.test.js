import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import {
  creaRisorsaRicorrenti,
  presentaRicorrente,
  prossimaEsecuzione,
} from '../src/utils/ricorrenti.js';

test('usa il giorno di questo mese quando non è ancora passato', () => {
  const risultato = prossimaEsecuzione(20, dayjs('2026-09-17'));
  assert.equal(risultato.format('YYYY-MM-DD'), '2026-09-20');
});

test('passa al mese successivo quando il giorno è già trascorso', () => {
  const risultato = prossimaEsecuzione(5, dayjs('2026-09-17'));
  assert.equal(risultato.format('YYYY-MM-DD'), '2026-10-05');
});

test('limita il giorno all ultimo giorno disponibile nel mese', () => {
  const risultato = prossimaEsecuzione(31, dayjs('2026-09-17'));
  assert.equal(risultato.format('YYYY-MM-DD'), '2026-09-30');
});

test('presenta tutti i dati restituiti dal backend senza inventare una pausa', () => {
  const item = presentaRicorrente({
    tipo: 'uscita',
    importo: '19.90',
    descrizione: 'Telefono',
    ricorrente_frequenza: 'mensile',
    ricorrente_giorno: 5,
    ricorrente: true,
    conto: { nome: 'Carta' },
  }, dayjs('2026-09-17'));

  assert.deepEqual(item, {
    descrizione: 'Telefono',
    tipoLabel: 'Uscita',
    frequenzaLabel: 'Ogni mese',
    contoLabel: 'Carta',
    statoLabel: 'Attiva',
    prossimaEsecuzione: '2026-10-05',
  });
});

test('una risposta riuscita senza ricorrenti produce lo stato vuoto', async () => {
  const risorsa = creaRisorsaRicorrenti(async () => []);
  await risorsa.carica();
  assert.equal(risorsa.stato.value, 'vuoto');
  assert.deepEqual(risorsa.data.value, []);
});

test('mostra sospesa e terminata senza una prossima esecuzione inventata', () => {
  for (const [stato, label] of [['sospesa', 'Sospesa'], ['terminata', 'Terminata']]) {
    const item = presentaRicorrente({
      tipo: 'uscita', ricorrente: true, stato_ricorrenza: stato,
      ricorrente_frequenza: 'mensile', ricorrente_giorno: 5,
    }, dayjs('2026-09-17'));
    assert.equal(item.statoLabel, label);
    assert.equal(item.prossimaEsecuzione, null);
  }
});

test('una spesa programmata si presenta con la sua data, non con una cadenza', () => {
  const item = presentaRicorrente({
    tipo: 'uscita',
    importo: '300.00',
    descrizione: 'Concerto',
    ricorrente: true,
    stato_ricorrenza: 'attiva',
    ricorrente_frequenza: 'una_tantum',
    ricorrente_data: '2026-10-10',
    conto: { nome: 'Conto' },
  }, dayjs('2026-09-25'));

  assert.equal(item.frequenzaLabel, 'Una tantum');
  assert.equal(item.prossimaEsecuzione, '2026-10-10');
});

test('un fallimento produce errore e retry recupera i dati', async () => {
  let tentativi = 0;
  const risorsa = creaRisorsaRicorrenti(async () => {
    tentativi += 1;
    if (tentativi === 1) throw new Error('rete');
    return [{ id: 7 }];
  });

  await risorsa.carica();
  assert.equal(risorsa.stato.value, 'errore');
  await risorsa.riprova();
  assert.equal(risorsa.stato.value, 'pronto');
  assert.deepEqual(risorsa.data.value, [{ id: 7 }]);
});
