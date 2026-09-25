import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import {
  creaRisorsaRicorrenti,
  ordinaProssimeSpese,
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

const spesa = (extra) => ({
  id: extra.id,
  tipo: 'uscita',
  importo: '50.00',
  descrizione: extra.descrizione || 'Spesa',
  ricorrente: true,
  stato_ricorrenza: 'attiva',
  conto: { nome: 'Conto' },
  ...extra,
});

test('le spese programmate vengono prima delle periodiche, anche se più lontane', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, ricorrente_frequenza: 'mensile', ricorrente_giorno: 26 }),
    spesa({ id: 2, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-20' }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [2, 1]);
});

test('fra spese dello stesso gruppo vince la più imminente', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, ricorrente_frequenza: 'annuale', ricorrente_giorno: 1, ricorrente_mese: 12 }),
    spesa({ id: 2, ricorrente_frequenza: 'settimanale', ricorrente_giorno: 6 }),
    spesa({ id: 3, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-11-01' }),
    spesa({ id: 4, ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-09-30' }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [4, 3, 2, 1]);
});

test('entrate, sospese e terminate restano fuori dalle prossime spese', () => {
  const oggi = dayjs('2026-09-25');
  const ordinate = ordinaProssimeSpese([
    spesa({ id: 1, tipo: 'entrata', ricorrente_frequenza: 'mensile', ricorrente_giorno: 27 }),
    spesa({ id: 2, stato_ricorrenza: 'sospesa', ricorrente_frequenza: 'mensile', ricorrente_giorno: 27 }),
    spesa({ id: 3, stato_ricorrenza: 'terminata', ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-09-26' }),
    spesa({ id: 4, ricorrente_frequenza: 'mensile', ricorrente_giorno: 28 }),
  ], oggi);

  assert.deepEqual(ordinate.map((s) => s.id), [4]);
});
