/**
 * Utility di fuso orario per le notifiche.
 *
 * Stesso approccio già usato da `services/ricorrenti.service.js`: solo
 * `Intl.DateTimeFormat`, nessuna dipendenza aggiuntiva lato server.
 *
 * Tutte le decisioni anti-spam (limite giornaliero, ore di silenzio, orario
 * del promemoria) sono espresse nel fuso dell'utente, non in quello del
 * server: su Vercel il processo gira in UTC, quindi ragionare in ora locale
 * di processo darebbe risultati sbagliati per metà giornata.
 */

const FUSO_DEFAULT = 'Europe/Rome';

const fusoValido = (timeZone) => {
  if (!timeZone) return FUSO_DEFAULT;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    // Un fuso non riconosciuto non deve far fallire il job dell'intero
    // sistema: si degrada al default documentato.
    return FUSO_DEFAULT;
  }
};

/** Parti della data/ora locale nel fuso indicato. */
const partiLocali = (date, timeZone) => {
  const tz = fusoValido(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const ore = Number(v.hour);
  const minuti = Number(v.minute);

  return {
    anno: Number(v.year),
    mese: Number(v.month),
    giorno: Number(v.day),
    ore,
    minuti,
    /** 'YYYY-MM-DD' nel fuso dell'utente */
    data: `${v.year}-${v.month}-${v.day}`,
    /** 'YYYY-MM' nel fuso dell'utente */
    periodo: `${v.year}-${v.month}`,
    minutiDelGiorno: ore * 60 + minuti,
  };
};

/** 'YYYY-MM-DD' del giorno locale dell'utente. */
const giornoLocale = (date, timeZone) => partiLocali(date, timeZone).data;

/** Scarto (ms) fra ora locale del fuso e UTC nell'istante indicato. */
const offsetMs = (date, timeZone) => {
  const p = partiLocali(date, timeZone);
  const comeSeUtc = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ore, p.minuti, 0);
  // Il confronto va fatto al secondo pieno: partiLocali non espone i ms.
  const riferimento = Math.floor(date.getTime() / 60000) * 60000;
  return comeSeUtc - riferimento;
};

/**
 * Converte un orario da calendario locale ('YYYY-MM-DD' + 'HH:MM' nel fuso
 * dell'utente) nell'istante assoluto corrispondente.
 *
 * Doppia passata: la prima stima usa l'offset "sbagliato" del momento, la
 * seconda lo ricalcola sull'istante stimato. È il metodo standard per
 * gestire i cambi di ora legale senza libreria.
 */
const istanteDaOrarioLocale = (dataIso, orario, timeZone) => {
  const [anno, mese, giorno] = String(dataIso).split('-').map(Number);
  const { ore, minuti } = parseOrario(orario);
  const comeSeUtc = Date.UTC(anno, mese - 1, giorno, ore, minuti, 0);

  let stima = new Date(comeSeUtc - offsetMs(new Date(comeSeUtc), timeZone));
  stima = new Date(comeSeUtc - offsetMs(stima, timeZone));
  return stima;
};

/** 'HH:MM' → { ore, minuti, minutiDelGiorno }. Valori non validi → 00:00. */
const parseOrario = (orario) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(orario || '').trim());
  if (!match) return { ore: 0, minuti: 0, minutiDelGiorno: 0 };

  const ore = Math.min(23, Math.max(0, Number(match[1])));
  const minuti = Math.min(59, Math.max(0, Number(match[2])));
  return { ore, minuti, minutiDelGiorno: ore * 60 + minuti };
};

/** Somma giorni a una data 'YYYY-MM-DD' restituendo lo stesso formato. */
const sommaGiorni = (dataIso, giorni) => {
  const [anno, mese, giorno] = String(dataIso).split('-').map(Number);
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
};

/**
 * true se l'istante cade nelle ore di silenzio dell'utente.
 * Gestisce l'intervallo che scavalca la mezzanotte (22:00 → 08:00), che è
 * il caso di default.
 */
const inOreDiSilenzio = (date, { timezone, quiet_hours_inizio: inizio, quiet_hours_fine: fine }) => {
  const inizioMin = parseOrario(inizio).minutiDelGiorno;
  const fineMin = parseOrario(fine).minutiDelGiorno;
  if (inizioMin === fineMin) return false; // finestra nulla = silenzio disattivato

  const adesso = partiLocali(date, timezone).minutiDelGiorno;
  return inizioMin > fineMin
    ? (adesso >= inizioMin || adesso < fineMin)
    : (adesso >= inizioMin && adesso < fineMin);
};

/**
 * Primo istante in cui è lecito consegnare una notifica: `date` stesso se
 * siamo fuori dalle ore di silenzio, altrimenti l'orario di fine silenzio
 * (oggi o domani, a seconda di dove cade `date` nella finestra).
 */
const prossimoIstanteConsentito = (date, preferenze) => {
  if (!inOreDiSilenzio(date, preferenze)) return date;

  const { timezone } = preferenze;
  const inizioMin = parseOrario(preferenze.quiet_hours_inizio).minutiDelGiorno;
  const fineMin = parseOrario(preferenze.quiet_hours_fine).minutiDelGiorno;
  const locale = partiLocali(date, timezone);

  // Silenzio a cavallo della mezzanotte e siamo nella parte serale:
  // la fine del silenzio cade il giorno dopo.
  const giornoFine = inizioMin > fineMin && locale.minutiDelGiorno >= inizioMin
    ? sommaGiorni(locale.data, 1)
    : locale.data;

  return istanteDaOrarioLocale(giornoFine, preferenze.quiet_hours_fine, timezone);
};

/** Settimana ISO ('YYYY-Www') del giorno locale: chiave del riepilogo settimanale. */
const settimanaIso = (date, timeZone) => {
  const { anno, mese, giorno } = partiLocali(date, timeZone);
  const d = new Date(Date.UTC(anno, mese - 1, giorno));
  const giornoSettimana = d.getUTCDay() || 7; // lunedì = 1, domenica = 7
  d.setUTCDate(d.getUTCDate() + 4 - giornoSettimana); // giovedì della stessa settimana ISO
  const primoGennaio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((d - primoGennaio) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(numero).padStart(2, '0')}`;
};

module.exports = {
  FUSO_DEFAULT,
  fusoValido,
  partiLocali,
  giornoLocale,
  parseOrario,
  sommaGiorni,
  istanteDaOrarioLocale,
  inOreDiSilenzio,
  prossimoIstanteConsentito,
  settimanaIso,
};
