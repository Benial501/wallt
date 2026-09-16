import dayjs from 'dayjs';
// La locale sta qui, accanto alla logica che ne dipende: senza,
// `startOf('week')` fa iniziare la settimana di domenica.
import 'dayjs/locale/it.js';

dayjs.locale('it');

/**
 * Da stato dei filtri a parametri della query dei movimenti.
 *
 * Modulo puro e separato dal componente perché è l'unica forma testabile: nel
 * client non c'è infrastruttura di rendering, solo `node --test`.
 *
 * NON si fonde con `periodoAnalisi.js`, che gli somiglia. Lì "anno" significa
 * da gennaio a oggi, perché le Analisi mostrano il periodo in corso; qui
 * l'utente sceglie un anno di calendario e lo vuole intero. Unirli
 * sembrerebbe una semplificazione e cambierebbe il significato di un filtro.
 */

export const PERIODI_MOVIMENTI = [
  { id: 'oggi', label: 'Oggi' },
  { id: 'settimana', label: 'Questa settimana' },
  { id: 'mese', label: 'Questo mese' },
  { id: 'anno', label: 'Anno' },
  { id: 'personalizzato', label: 'Personalizzato' },
];

/** Gli id coincidono con quelli accettati da GET /movimenti. */
export const ORDINI_MOVIMENTI = [
  { id: 'data', label: 'Più recenti' },
  { id: 'importo_desc', label: 'Importo decrescente' },
  { id: 'importo_asc', label: 'Importo crescente' },
];

const TIPI = [
  { id: 'entrata', label: 'Entrate' },
  { id: 'uscita', label: 'Uscite' },
  { id: 'trasferimento', label: 'Trasferimenti' },
];

export const FILTRI_INIZIALI = {
  tipo: '',
  periodo: 'mese',
  anno: dayjs().year(),
  categoria: '',
  conto: '',
  cerca: '',
  ordine: 'data',
  da: '',
  a: '',
};

const intervallo = (filtri, oggi) => {
  const a = oggi.format('YYYY-MM-DD');
  switch (filtri.periodo) {
    case 'oggi':
      return { da: a, a };
    case 'settimana':
      return { da: oggi.startOf('week').format('YYYY-MM-DD'), a };
    case 'anno': {
      const anno = dayjs().year(filtri.anno || oggi.year());
      return {
        da: anno.startOf('year').format('YYYY-MM-DD'),
        a: anno.endOf('year').format('YYYY-MM-DD'),
      };
    }
    case 'personalizzato':
      // Un intervallo a metà non è un filtro: senza entrambi gli estremi non
      // si manda nulla, altrimenti la lista si restringerebbe in un modo che
      // l'utente non ha chiesto.
      return filtri.da && filtri.a ? { da: filtri.da, a: filtri.a } : {};
    case 'mese':
    default:
      return { da: oggi.startOf('month').format('YYYY-MM-DD'), a };
  }
};

/** Solo le chiavi valorizzate: un parametro vuoto è rumore nella query. */
export const aParametriQuery = (filtri, oggi = dayjs()) => {
  const params = { ...intervallo(filtri, oggi) };

  if (filtri.tipo) params.tipo = filtri.tipo;
  if (filtri.categoria) params.categoria = filtri.categoria;
  if (filtri.conto) params.conto_id = filtri.conto;

  const cerca = (filtri.cerca || '').trim();
  if (cerca) params.cerca = cerca;

  // `data` è già il default del server.
  if (filtri.ordine && filtri.ordine !== 'data') params.ordine = filtri.ordine;

  return params;
};

/**
 * Filtri attivi da mostrare come elementi rimovibili. Il periodo predefinito
 * non compare: non è qualcosa che l'utente ha scelto.
 */
export const filtriAttivi = (filtri, { nomeCategoria, nomeConto } = {}) => {
  const attivi = [];

  if (filtri.tipo) {
    attivi.push({
      chiave: 'tipo',
      etichetta: TIPI.find((t) => t.id === filtri.tipo)?.label || filtri.tipo,
    });
  }
  if (filtri.categoria) {
    attivi.push({
      chiave: 'categoria',
      etichetta: nomeCategoria?.(filtri.categoria) || filtri.categoria,
    });
  }
  if (filtri.conto) {
    attivi.push({
      chiave: 'conto',
      etichetta: nomeConto?.(filtri.conto) || 'Conto',
    });
  }
  if ((filtri.cerca || '').trim()) {
    attivi.push({ chiave: 'cerca', etichetta: `Ricerca: ${filtri.cerca.trim()}` });
  }
  if (filtri.periodo !== FILTRI_INIZIALI.periodo) {
    attivi.push({
      chiave: 'periodo',
      etichetta: PERIODI_MOVIMENTI.find((p) => p.id === filtri.periodo)?.label || 'Periodo',
    });
  }
  if (filtri.ordine !== FILTRI_INIZIALI.ordine) {
    attivi.push({
      chiave: 'ordine',
      etichetta: ORDINI_MOVIMENTI.find((o) => o.id === filtri.ordine)?.label || 'Ordine',
    });
  }

  return attivi;
};

export const contaFiltriAttivi = (filtri) => filtriAttivi(filtri).length;
