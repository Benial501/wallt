import dayjs from 'dayjs';
// La locale sta qui, accanto alla logica che ne dipende: senza, `startOf('week')`
// fa iniziare la settimana di domenica e il periodo "Settimana" risulta sfasato.
// Tenerla nella vista la rendeva sensibile all'ordine di caricamento dei moduli.
import 'dayjs/locale/it.js';

dayjs.locale('it');

export const PERIODI = [
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'anno', label: 'Anno' },
  { id: 'custom', label: 'Custom' },
];

/**
 * Intervallo di date per il periodo scelto nelle Analisi.
 * Vale sia per le spese sia per le entrate: i due tab condividono il selettore.
 *
 * @param {string} periodo  uno degli id in PERIODI
 * @param {{ customDa: string, customA: string }} custom  usato solo da 'custom'
 * @param {object} [now]  istante di riferimento, iniettabile nei test
 */
export const getDateRange = (periodo, { customDa, customA } = {}, now = dayjs()) => {
  const a = now.format('YYYY-MM-DD');
  switch (periodo) {
    // Settimana corrente, da lunedì a oggi: non gli ultimi sette giorni.
    case 'settimana': return { da: now.startOf('week').format('YYYY-MM-DD'), a };
    case 'mese': return { da: now.startOf('month').format('YYYY-MM-DD'), a };
    case 'trimestre': return { da: now.subtract(3, 'month').format('YYYY-MM-DD'), a };
    case 'anno': return { da: now.startOf('year').format('YYYY-MM-DD'), a };
    default: return { da: customDa, a: customA };
  }
};
