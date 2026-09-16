import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from 'dayjs';
import {
  FILTRI_INIZIALI, PERIODI_MOVIMENTI, ORDINI_MOVIMENTI,
  aParametriQuery, filtriAttivi, contaFiltriAttivi,
} from '../src/utils/filtriMovimenti.js';

// Giovedì 10 settembre 2026.
const OGGI = dayjs('2026-09-10');

test('i filtri iniziali partono dal mese corrente e senza ricerca', () => {
  assert.equal(FILTRI_INIZIALI.periodo, 'mese');
  assert.equal(FILTRI_INIZIALI.tipo, '');
  assert.equal(FILTRI_INIZIALI.cerca, '');
  assert.equal(FILTRI_INIZIALI.ordine, 'data');
});

test('gli id degli ordinamenti coincidono con quelli accettati dall\'API', () => {
  assert.deepEqual(
    ORDINI_MOVIMENTI.map((o) => o.id),
    ['data', 'importo_desc', 'importo_asc'],
  );
});

test('il mese va dal primo giorno a oggi', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'mese' }, OGGI);
  assert.equal(p.da, '2026-09-01');
  assert.equal(p.a, '2026-09-10');
});

test('oggi è un intervallo di un giorno solo', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'oggi' }, OGGI);
  assert.equal(p.da, '2026-09-10');
  assert.equal(p.a, '2026-09-10');
});

test('la settimana parte dal lunedì, non dagli ultimi sette giorni', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'settimana' }, OGGI);
  assert.equal(p.da, '2026-09-07');
  assert.equal(p.a, '2026-09-10');
});

test('l\'anno è quello scelto per intero, non da gennaio a oggi', () => {
  // È la differenza con periodoAnalisi.js: là "anno" significa da gennaio a
  // oggi, qui l'utente sceglie un anno di calendario e lo vuole tutto.
  const p = aParametriQuery({ ...FILTRI_INIZIALI, periodo: 'anno', anno: 2025 }, OGGI);
  assert.equal(p.da, '2025-01-01');
  assert.equal(p.a, '2025-12-31');
});

test('un intervallo personalizzato incompleto non produce date', () => {
  const p = aParametriQuery({
    ...FILTRI_INIZIALI, periodo: 'personalizzato', da: '2026-01-01', a: '',
  }, OGGI);
  assert.equal(p.da, undefined);
  assert.equal(p.a, undefined);
});

test('le chiavi vuote non finiscono nella query', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI }, OGGI);
  assert.equal('tipo' in p, false);
  assert.equal('categoria' in p, false);
  assert.equal('cerca' in p, false);
  // `data` è il default del server: mandarlo sarebbe rumore.
  assert.equal('ordine' in p, false);
});

test('traduce conto e ordinamento nei nomi accettati dall\'API', () => {
  const p = aParametriQuery({
    ...FILTRI_INIZIALI,
    tipo: 'uscita',
    categoria: 'supermercato',
    conto: '42',
    ordine: 'importo_desc',
  }, OGGI);

  assert.equal(p.tipo, 'uscita');
  assert.equal(p.categoria, 'supermercato');
  assert.equal(p.conto_id, '42');
  assert.equal(p.ordine, 'importo_desc');
});

test('la ricerca viene ripulita dagli spazi ai bordi', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, cerca: '  esselunga  ' }, OGGI);
  assert.equal(p.cerca, 'esselunga');
});

test('una ricerca di soli spazi non diventa un filtro', () => {
  const p = aParametriQuery({ ...FILTRI_INIZIALI, cerca: '   ' }, OGGI);
  assert.equal('cerca' in p, false);
});

test('i filtri attivi si presentano con il nome leggibile, non con l\'id', () => {
  const attivi = filtriAttivi(
    {
      ...FILTRI_INIZIALI,
      tipo: 'uscita',
      categoria: 'supermercato',
      conto: '42',
      cerca: 'coop',
      ordine: 'importo_desc',
    },
    { nomeCategoria: () => 'Supermercato', nomeConto: () => 'Conto principale' },
  );
  const etichette = attivi.map((f) => f.etichetta);
  assert.ok(etichette.includes('Uscite'));
  assert.ok(etichette.includes('Supermercato'));
  assert.ok(etichette.includes('Conto principale'));
  assert.ok(etichette.includes('Ricerca: coop'));
  assert.ok(etichette.includes('Importo decrescente'));
});

test('il periodo predefinito non conta come filtro attivo', () => {
  assert.equal(contaFiltriAttivi({ ...FILTRI_INIZIALI }), 0);
  assert.equal(contaFiltriAttivi({ ...FILTRI_INIZIALI, tipo: 'entrata' }), 1);
});

test('ogni periodo dichiarato sa produrre un intervallo', () => {
  PERIODI_MOVIMENTI.forEach(({ id }) => {
    const p = aParametriQuery({
      ...FILTRI_INIZIALI,
      periodo: id,
      da: '2026-01-01',
      a: '2026-02-01',
    }, OGGI);
    assert.ok(p.da && p.a, `il periodo ${id} non produce un intervallo`);
  });
});
