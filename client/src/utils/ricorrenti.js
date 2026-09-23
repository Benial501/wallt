import dayjs from 'dayjs';
import { creaRisorsa } from './risorsa.js';

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

const FREQUENZA_LABELS = { mensile: 'Ogni mese', settimanale: 'Ogni settimana', annuale: 'Ogni anno' };

const calcolaProssimaEsecuzione = (movimento, oggi) => {
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
  statoLabel: movimento.ricorrente ? 'Attiva' : 'Non attiva',
  prossimaEsecuzione: calcolaProssimaEsecuzione(movimento, oggi).format('YYYY-MM-DD'),
});

export const creaRisorsaRicorrenti = (fetcher) => creaRisorsa(fetcher, { iniziale: [] });
