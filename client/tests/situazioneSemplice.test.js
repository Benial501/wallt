import test from 'node:test';
import assert from 'node:assert/strict';
import {
  situazioneVuota, passiIniziali, statoOggi, rispostaSimulazione,
  gruppiScadenze, riepilogoProssimi, confrontoTrentaGiorni, vociPrincipali,
} from '../src/utils/situazioneSemplice.js';

const euro = (v) => `${v} €`;
const data = (v) => v;

test('senza movimenti la situazione è vuota e i passi sono tutti da fare', () => {
  const nuova = { dataQuality: { firstMovementDate: null }, current: { liquidity: null }, cashFlowTimeline: [], upcoming: { items: [] } };
  assert.equal(situazioneVuota(nuova), true);
  assert.deepEqual(passiIniziali(nuova).map((p) => p.fatto), [false, false, false]);
  const avviata = { dataQuality: { firstMovementDate: '2026-11-01' }, current: { liquidity: '120.00' }, cashFlowTimeline: [{ direction: 'uscita' }] };
  assert.equal(situazioneVuota(avviata), false);
  assert.deepEqual(passiIniziali(avviata).map((p) => p.fatto), [true, true, true]);
});

test('lo stato di Oggi segue lo stato deciso dal server', () => {
  const base = (horizon, extra = {}) => ({ horizon, forecast: { endOfMonthAvailable: extra.fine ?? null }, current: { paceStatus: extra.ritmo } });
  assert.equal(statoOggi(base({ stato: 'scoperto', mancanti: '40.00' }), { euro, data }).tono, 'male');
  assert.equal(statoOggi(base({ stato: 'in_rotta', tipo: 'mensile' }, { fine: '80.00' }), { euro, data }).tono, 'bene');
  assert.equal(statoOggi(base({ stato: 'in_rotta', tipo: 'mensile' }, { fine: '-10.00' }), { euro, data }).tono, 'male');
  assert.equal(statoOggi(base({ stato: 'in_rotta', tipo: 'mensile' }, { fine: '30.00', ritmo: 'sopra_il_ritmo' }), { euro, data }).tono, 'attenzione');
  assert.equal(statoOggi(base({ stato: 'non_stimabile' }), { euro, data }).tono, 'neutro');
});

test('la simulazione risponde con un sì o un no', () => {
  assert.equal(rispostaSimulazione(null, { euro }), null);
  assert.equal(rispostaSimulazione({ status: 'compatibile', availableAfter: '100.00', dailyLimitAfter: '5.00' }, { euro }).titolo, 'Sì, puoi');
  assert.equal(rispostaSimulazione({ status: 'compatibile', availableAfter: '-5.00' }, { euro }).titolo, 'Meglio di no');
});

test('le scadenze si raggruppano per settimana e il riepilogo somma in centesimi', () => {
  const items = [
    { dueDate: '2026-11-07', direction: 'uscita', amount: '0.10', marginAfter: '99.90' },
    { dueDate: '2026-11-15', direction: 'uscita', amount: '0.20', marginAfter: '99.70' },
    { dueDate: '2026-12-01', direction: 'entrata', amount: '50.00', marginAfter: '149.70' },
  ];
  assert.deepEqual(gruppiScadenze(items, '2026-11-06').map((g) => g.chiave), ['settimana', 'prossima', 'avanti']);
  const r = riepilogoProssimi(items);
  assert.equal(r.uscite, '0.30');
  assert.equal(r.entrate, '50.00');
  assert.equal(r.restaDopo, 149.7);
});

test('il confronto a 30 giorni compare solo con lo storico completo', () => {
  const punto = (quality) => ({ points: [{ days: 30, quality, delta: { expenses: '-80.00' }, changedCategories: [] }] });
  assert.equal(confrontoTrentaGiorni(punto('storico_limitato')), null);
  assert.equal(confrontoTrentaGiorni(punto('storico_disponibile')).delta, -80);
});

test('le voci principali sono le tre più grandi, il resto riassunto', () => {
  const items = [['a', '10.00'], ['b', '300.00'], ['c', '50.00'], ['d', '20.00'], ['e', '0.00']].map(([category, average]) => ({ category, average, name: category }));
  const v = vociPrincipali({ monthly: { items } });
  assert.deepEqual(v.principali.map((i) => i.category), ['b', 'c', 'd']);
  assert.equal(v.principali[0].percentuale, 100);
  assert.deepEqual(v.resto, { voci: 1, totale: '10.00' });
});

test('la composizione dello spendibile torna sempre, con lo scarto in una riga a sé', async () => {
  const { composizioneSpendibile } = await import('../src/utils/situazioneSemplice.js');
  const s = (capitale) => ({
    current: { liquidity: '1362.70', allocatedToGoals: '100.00' },
    horizon: { impegniFinoA: '645.00', riservaFinoA: null, capitaleLibero: capitale },
  });
  assert.deepEqual(composizioneSpendibile(s('617.70')), {
    conti: '1362.70', obiettivi: '100.00', impegni: '645.00', riserva: null, altro: null, risultato: '617.70',
  });
  assert.equal(composizioneSpendibile(s('517.70')).altro, '100.00');
  assert.equal(composizioneSpendibile({ current: {}, horizon: {} }), null);
});

test('le entrate in arrivo si dividono alla fine del periodo e il ritmo si legge a parole', async () => {
  const { entrateInArrivo, ritmoSpesa } = await import('../src/utils/situazioneSemplice.js');
  const situazione = {
    horizon: { dataFine: '2026-11-30', budgetGiornaliero: '30.00' },
    current: { actualDailySpend: '25.00' },
    cashFlowTimeline: [
      { direction: 'entrata', dueDate: '2026-11-27' },
      { direction: 'uscita', dueDate: '2026-11-15' },
      { direction: 'entrata', dueDate: '2026-12-01' },
    ],
  };
  const e = entrateInArrivo(situazione);
  assert.equal(e.entro.length, 1);
  assert.equal(e.dopo.length, 1);
  assert.equal(ritmoSpesa(situazione, { euro: (v) => v }).tono, 'bene');
  assert.equal(ritmoSpesa({ ...situazione, current: { actualDailySpend: '40' } }, { euro: (v) => v }).tono, 'attenzione');
});
