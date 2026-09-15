import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIODI_ANDAMENTO, statistichePunti, useAndamentoPatrimonio } from '../src/composables/useAndamentoPatrimonio.js';

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

/**
 * Da qui in giù si prova `useAndamentoPatrimonio` stesso, non solo le sue
 * funzioni pure. Senza `fetcher` iniettabile, provare `carica`,
 * `cambiaPeriodo`, `vuotoSe` e la guardia di sequenza avrebbe richiesto un
 * doppione del file con `api` sostituita a mano — ed è proprio la logica
 * che si rompe in silenzio se nessuno la guarda.
 *
 * Nota per chi legge: `stato`, `periodo` e `punti` restituiti dal
 * composable sono `ref` veri (non scompattati da `reactive()`, che qui non
 * c'è), quindi si leggono con `.value` — il verso opposto di
 * `storeUnwrap.test.js`, dove lo scompattamento avviene ed è `.value` a
 * essere sbagliato.
 */
const datiAndamento = (overrides = {}) => ({
  punti: [],
  inizio: 0,
  fine: 0,
  min: 0,
  max: 0,
  variazione_importo: 0,
  variazione_percentuale: 0,
  ...overrides,
});

test('carica manda unità e quantità del periodo scelto', async () => {
  const chiamate = [];
  const fetcher = async (unita, quantita) => {
    chiamate.push([unita, quantita]);
    return datiAndamento();
  };
  const andamento = useAndamentoPatrimonio({ periodoIniziale: 'giorni_7', fetcher });

  await andamento.carica();

  assert.deepEqual(chiamate, [['giorno', 7]]);
});

test('cambiaPeriodo rilegge col periodo nuovo e aggiorna periodo.value', async () => {
  const chiamate = [];
  const fetcher = async (unita, quantita) => {
    chiamate.push([unita, quantita]);
    return datiAndamento();
  };
  const andamento = useAndamentoPatrimonio({ periodoIniziale: 'mesi_3', fetcher });

  await andamento.carica();
  await andamento.cambiaPeriodo('anno_1');

  assert.equal(andamento.periodo.value, 'anno_1');
  assert.deepEqual(chiamate, [['settimana', 12], ['mese', 12]]);
});

test('cambiaPeriodo con un id sconosciuto non fa nulla', async () => {
  let chiamate = 0;
  const fetcher = async () => {
    chiamate += 1;
    return datiAndamento();
  };
  const andamento = useAndamentoPatrimonio({ periodoIniziale: 'giorni_7', fetcher });

  const risultato = await andamento.cambiaPeriodo('non_esiste');

  assert.equal(risultato, undefined);
  assert.equal(chiamate, 0, 'il fetcher non deve essere chiamato');
  assert.equal(andamento.periodo.value, 'giorni_7', 'il periodo resta quello di partenza');
});

test('una serie tutta a zero con delta a zero è vuota', async () => {
  const fetcher = async () => datiAndamento({
    punti: [{ patrimonio: 0, delta: 0 }, { patrimonio: 0, delta: 0 }],
  });
  const andamento = useAndamentoPatrimonio({ fetcher });

  await andamento.carica();

  assert.equal(andamento.stato.value, 'vuoto');
});

test('patrimonio a zero con un delta diverso da zero non è vuoto: l\'utente ha registrato movimenti', async () => {
  const fetcher = async () => datiAndamento({
    punti: [{ patrimonio: 0, delta: 50 }, { patrimonio: 0, delta: -50 }],
    min: -50,
    max: 50,
  });
  const andamento = useAndamentoPatrimonio({ fetcher });

  await andamento.carica();

  assert.equal(andamento.stato.value, 'pronto');
});

test('una lettura lenta partita prima non sovrascrive una veloce partita dopo', async () => {
  // 'giorno' (il periodo di partenza) risponde lenta; 'mese' (il periodo
  // scelto subito dopo, senza attendere la prima) risponde veloce. Senza la
  // guardia di sequenza di creaRisorsa, la risposta lenta arriverebbe per
  // ultima e sovrascriverebbe quella veloce con dati vecchi.
  const fetcher = (unita) => new Promise((resolve) => {
    if (unita === 'giorno') {
      setTimeout(() => resolve(datiAndamento({ punti: [{ patrimonio: 111, delta: 0 }] })), 100);
    } else {
      setTimeout(() => resolve(datiAndamento({ punti: [{ patrimonio: 999, delta: 0 }] })), 5);
    }
  });
  const andamento = useAndamentoPatrimonio({ periodoIniziale: 'giorni_7', fetcher });

  const lenta = andamento.carica();
  const veloce = andamento.cambiaPeriodo('anno_1');
  await Promise.all([lenta, veloce]);

  assert.equal(andamento.periodo.value, 'anno_1');
  assert.equal(andamento.punti.value[0].patrimonio, 999, 'deve vincere la risposta della richiesta più recente');
});
