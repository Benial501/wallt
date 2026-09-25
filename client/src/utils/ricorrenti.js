import dayjs from 'dayjs';
import { creaRisorsa } from './risorsa.js';

// Frequenze processate dal cron (server/services/ricorrenti.service.js) più
// 'una_tantum' (spesa programmata con data fissa, addebitata una sola volta):
// un valore storico diverso (es. 'giornaliera', mai realmente supportata) va
// normalizzato a 'mensile' quando si riapre un movimento ricorrente esistente.
export const FREQUENZE_VALIDE = ['mensile', 'settimanale', 'annuale', 'una_tantum'];

export const GIORNI_SETTIMANA = [
  { id: 1, label: 'Lunedì' }, { id: 2, label: 'Martedì' }, { id: 3, label: 'Mercoledì' },
  { id: 4, label: 'Giovedì' }, { id: 5, label: 'Venerdì' }, { id: 6, label: 'Sabato' }, { id: 7, label: 'Domenica' },
];

export const MESI_ANNO = [
  { id: 1, label: 'Gennaio' }, { id: 2, label: 'Febbraio' }, { id: 3, label: 'Marzo' }, { id: 4, label: 'Aprile' },
  { id: 5, label: 'Maggio' }, { id: 6, label: 'Giugno' }, { id: 7, label: 'Luglio' }, { id: 8, label: 'Agosto' },
  { id: 9, label: 'Settembre' }, { id: 10, label: 'Ottobre' }, { id: 11, label: 'Novembre' }, { id: 12, label: 'Dicembre' },
];

/** Normalizza una frequenza storica/sconosciuta a 'mensile' (vedi FREQUENZE_VALIDE). */
export const normalizzaFrequenza = (frequenza) => (FREQUENZE_VALIDE.includes(frequenza) ? frequenza : 'mensile');

export const prossimaEsecuzione = (giorno, oggi = dayjs()) => {
  const giornoValido = Math.min(31, Math.max(1, Number(giorno) || 1));
  const inizioOggi = oggi.startOf('day');
  const nelMese = inizioOggi.date(Math.min(giornoValido, inizioOggi.daysInMonth()));

  if (!nelMese.isBefore(inizioOggi)) return nelMese;

  const prossimoMese = inizioOggi.add(1, 'month').startOf('month');
  return prossimoMese.date(Math.min(giornoValido, prossimoMese.daysInMonth()));
};

/** giornoSettimana: 1=lunedì..7=domenica (stessa convenzione del cron, vedi ricorrenti.service.js). */
export const prossimaEsecuzioneSettimanale = (giornoSettimana, oggi = dayjs()) => {
  const target = Math.min(7, Math.max(1, Number(giornoSettimana) || 1));
  const inizioOggi = oggi.startOf('day');
  // dayjs.day(): 0=domenica..6=sabato (nessun plugin isoWeek caricato in app).
  const jsDay = inizioOggi.day();
  const oggiIso = jsDay === 0 ? 7 : jsDay;
  const delta = (target - oggiIso + 7) % 7;
  return inizioOggi.add(delta, 'day');
};

export const prossimaEsecuzioneAnnuale = (giorno, mese, oggi = dayjs()) => {
  const giornoValido = Math.min(31, Math.max(1, Number(giorno) || 1));
  const meseValido = Math.min(12, Math.max(1, Number(mese) || 1));
  const inizioOggi = oggi.startOf('day');
  const perAnno = (anno) => {
    const primoDelMese = dayjs(`${anno}-${String(meseValido).padStart(2, '0')}-01`);
    return primoDelMese.date(Math.min(giornoValido, primoDelMese.daysInMonth()));
  };

  const questAnno = perAnno(inizioOggi.year());
  return questAnno.isBefore(inizioOggi) ? perAnno(inizioOggi.year() + 1) : questAnno;
};

const FREQUENZA_LABELS = {
  mensile: 'Ogni mese', settimanale: 'Ogni settimana', annuale: 'Ogni anno', una_tantum: 'Una tantum',
};

const calcolaProssimaEsecuzione = (movimento, oggi) => {
  // Una spesa programmata non ha una cadenza da proiettare: la sua data è
  // già scritta.
  if (movimento.ricorrente_frequenza === 'una_tantum') {
    return movimento.ricorrente_data ? dayjs(movimento.ricorrente_data) : oggi;
  }
  if (movimento.ricorrente_frequenza === 'settimanale') {
    return prossimaEsecuzioneSettimanale(movimento.ricorrente_giorno, oggi);
  }
  if (movimento.ricorrente_frequenza === 'annuale') {
    return prossimaEsecuzioneAnnuale(movimento.ricorrente_giorno, movimento.ricorrente_mese, oggi);
  }
  return prossimaEsecuzione(movimento.ricorrente_giorno, oggi);
};

export const presentaRicorrente = (movimento, oggi = dayjs()) => ({
  descrizione: movimento.descrizione?.trim() || 'Movimento ricorrente',
  tipoLabel: movimento.tipo === 'entrata' ? 'Entrata' : 'Uscita',
  frequenzaLabel: FREQUENZA_LABELS[movimento.ricorrente_frequenza] || 'Ogni mese',
  contoLabel: movimento.conto?.nome || 'Conto non disponibile',
  statoLabel: movimento.stato_ricorrenza === 'sospesa' ? 'Sospesa'
    : movimento.stato_ricorrenza === 'terminata' ? 'Terminata'
      : movimento.ricorrente ? 'Attiva' : 'Non attiva',
  prossimaEsecuzione: movimento.stato_ricorrenza === 'sospesa' || movimento.stato_ricorrenza === 'terminata'
    ? null : calcolaProssimaEsecuzione(movimento, oggi).format('YYYY-MM-DD'),
});

export const creaRisorsaRicorrenti = (fetcher) => creaRisorsa(fetcher, { iniziale: [] });

/**
 * Le prossime spese come le vuole la home: prima quelle programmate (sono
 * eventi singoli e datati, l'utente le ha appuntate proprio per non
 * dimenticarle), poi le periodiche per imminenza. Entrate, sospese e
 * terminate restano fuori: non sono soldi in uscita nei prossimi giorni.
 *
 * Restituisce le voci originali arricchite con `presentazione`, così la
 * card non ricalcola nulla e resta una vista.
 */
export const ordinaProssimeSpese = (movimenti = [], oggi = dayjs()) => (movimenti || [])
  .filter((m) => m.tipo === 'uscita'
    && m.ricorrente
    && (m.stato_ricorrenza || 'attiva') === 'attiva')
  .map((m) => ({ ...m, presentazione: presentaRicorrente(m, oggi) }))
  .sort((a, b) => {
    const gruppo = (m) => (m.ricorrente_frequenza === 'una_tantum' ? 0 : 1);
    if (gruppo(a) !== gruppo(b)) return gruppo(a) - gruppo(b);
    const data = (m) => m.presentazione.prossimaEsecuzione || '9999-12-31';
    return data(a).localeCompare(data(b)) || (a.id - b.id);
  });
