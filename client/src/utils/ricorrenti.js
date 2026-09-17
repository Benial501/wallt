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

export const presentaRicorrente = (movimento, oggi = dayjs()) => ({
  descrizione: movimento.descrizione?.trim() || 'Movimento ricorrente',
  tipoLabel: movimento.tipo === 'entrata' ? 'Entrata' : 'Uscita',
  frequenzaLabel: 'Ogni mese',
  contoLabel: movimento.conto?.nome || 'Conto non disponibile',
  statoLabel: movimento.ricorrente ? 'Attiva' : 'Non attiva',
  prossimaEsecuzione: prossimaEsecuzione(movimento.ricorrente_giorno, oggi).format('YYYY-MM-DD'),
});

export const creaRisorsaRicorrenti = (fetcher) => creaRisorsa(fetcher, { iniziale: [] });
