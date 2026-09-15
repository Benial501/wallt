import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIODI_ANDAMENTO, statistichePunti } from '../src/composables/useAndamentoPatrimonio.js';

test('i quattro periodi mappano sulle unità che il server sa costruire', () => {
  assert.deepEqual(
    PERIODI_ANDAMENTO.map(({ id, unita, quantita }) => ({ id, unita, quantita })),
    [
      { id: 'giorni_7', unita: 'giorno', quantita: 7 },
      { id: 'giorni_30', unita: 'giorno', quantita: 30 },
      // Dodici settimane, non tre mesi: tre punti non sono una linea.
      { id: 'mesi_3', unita: 'settimana', quantita: 12 },
      { id: 'anno_1', unita: 'mese', quantita: 12 },
    ],
  );
});

test('nessuna quantità supera il tetto della propria unità', () => {
  const TETTI = { giorno: 31, settimana: 12, mese: 12, anno: 12 };
  PERIODI_ANDAMENTO.forEach(({ id, unita, quantita }) => {
    assert.ok(quantita <= TETTI[unita], `${id} supera il tetto di ${unita}`);
    assert.ok(quantita >= 2, `${id} sta sotto il minimo`);
  });
});

test('le statistiche riportano i valori del server senza ricalcolarli', () => {
  const s = statistichePunti({
    punti: [{ patrimonio: 100 }, { patrimonio: 150 }],
    inizio: 100, fine: 150, min: 100, max: 150,
    variazione_importo: 50, variazione_percentuale: 50,
  });
  assert.equal(s.inizio, 100);
  assert.equal(s.fine, 150);
  assert.equal(s.variazioneImporto, 50);
  assert.equal(s.variazionePercentuale, 50);
  assert.equal(s.mostraPercentuale, true);
});

test('la percentuale si nasconde quando la base è sotto un euro', () => {
  // Chi parte da 0,50 € vedrebbe +12.000%: vero e inutile.
  const s = statistichePunti({
    punti: [{ patrimonio: 0.5 }, { patrimonio: 60.5 }],
    inizio: 0.5, fine: 60.5, min: 0.5, max: 60.5,
    variazione_importo: 60, variazione_percentuale: 12000,
  });
  assert.equal(s.mostraPercentuale, false);
  assert.equal(s.variazioneImporto, 60, 'l\'importo in euro resta sempre');
});

test('una base negativa vicina a zero nasconde la percentuale come quella positiva', () => {
  const s = statistichePunti({
    punti: [], inizio: -0.4, fine: 10, min: -0.4, max: 10,
    variazione_importo: 10.4, variazione_percentuale: 2600,
  });
  assert.equal(s.mostraPercentuale, false);
});

test('dati assenti non fanno lanciare le statistiche', () => {
  const s = statistichePunti(null);
  assert.equal(s.inizio, 0);
  assert.equal(s.fine, 0);
  assert.equal(s.mostraPercentuale, false);
});
