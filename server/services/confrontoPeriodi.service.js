/**
 * Costruisce gli intervalli del confronto nelle Analisi.
 *
 * L'unita' del confronto segue il periodo scelto in cima alla pagina: con
 * "Settimana" si confrontano settimane, con "Mese" mesi, con "Anno" anni.
 * "Trimestre" e "Custom" non hanno un selettore di quantita': il primo e'
 * fisso a 3 mesi, il secondo copre i mesi toccati dall'intervallo scelto.
 *
 * Qui c'e' solo il calcolo degli intervalli, senza query: e' la parte con la
 * logica di calendario (settimane che iniziano di lunedi', mesi di lunghezza
 * diversa, anni bisestili) ed e' quella che vale la pena testare da sola.
 */

const MESI_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Unita' che ammettono un numero di periodi scelto dall'utente. */
const UNITA_VALIDE = ['settimana', 'mese', 'anno'];

/** Estremi del selettore "quante ne confronto". */
const QUANTITA_MIN = 2;
const QUANTITA_MAX = 12;

/** Tetto di sicurezza sui mesi restituiti da un intervallo custom molto ampio. */
const MAX_PERIODI_CUSTOM = 24;

/**
 * Data in formato YYYY-MM-DD. Le date dei movimenti sono DATEONLY: vanno
 * trattate come giorni di calendario, mai come istanti, altrimenti il fuso del
 * processo (UTC su Vercel) sposta di un giorno i confini degli intervalli.
 */
const toISODate = (y, m, d) => (
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
);

/** Ultimo giorno del mese (m e' 1-based). */
const ultimoGiorno = (anno, mese) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

/** Lunedi' della settimana che contiene `date`. getUTCDay(): 0 = domenica. */
const lunediDellaSettimana = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const giorno = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (giorno === 0 ? 6 : giorno - 1));
  return d;
};

/** Normalizza la quantita' richiesta dentro gli estremi del selettore. */
const normalizzaQuantita = (valore, fallback = 6) => {
  const n = parseInt(valore, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(QUANTITA_MAX, Math.max(QUANTITA_MIN, n));
};

const bucketSettimane = (quantita, oggi) => {
  const lunediCorrente = lunediDellaSettimana(oggi);
  const periodi = [];

  for (let i = quantita - 1; i >= 0; i--) {
    const inizio = new Date(lunediCorrente);
    inizio.setUTCDate(inizio.getUTCDate() - i * 7);
    const fine = new Date(inizio);
    fine.setUTCDate(fine.getUTCDate() + 6);

    const da = inizio.toISOString().slice(0, 10);
    const a = fine.toISOString().slice(0, 10);
    const giornoInizio = inizio.getUTCDate();
    const giornoFine = fine.getUTCDate();
    const meseInizio = MESI_SHORT[inizio.getUTCMonth()];
    const meseFine = MESI_SHORT[fine.getUTCMonth()];

    periodi.push({
      chiave: da,
      // Etichetta corta per l'asse del grafico: la settimana si riconosce dal
      // lunedi'. L'intervallo per esteso sta in labelEsteso, per la tabella.
      label: `${giornoInizio} ${meseInizio.toLowerCase()}`,
      labelEsteso: meseInizio === meseFine
        ? `${giornoInizio}–${giornoFine} ${meseInizio}`
        : `${giornoInizio} ${meseInizio} – ${giornoFine} ${meseFine}`,
      da,
      a,
    });
  }

  return periodi;
};

const bucketMese = (anno, mese) => {
  const da = toISODate(anno, mese, 1);
  const a = toISODate(anno, mese, ultimoGiorno(anno, mese));
  const label = `${MESI_SHORT[mese - 1]} ${String(anno).slice(2)}`;
  return {
    chiave: `${anno}-${String(mese).padStart(2, '0')}`,
    label,
    labelEsteso: `${MESI_SHORT[mese - 1]} ${anno}`,
    da,
    a,
    mese,
    anno,
  };
};

const bucketMesi = (quantita, oggi) => {
  const periodi = [];
  for (let i = quantita - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - i, 1));
    periodi.push(bucketMese(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return periodi;
};

const bucketAnni = (quantita, oggi) => {
  const periodi = [];
  for (let i = quantita - 1; i >= 0; i--) {
    const anno = oggi.getUTCFullYear() - i;
    periodi.push({
      chiave: String(anno),
      label: String(anno),
      labelEsteso: String(anno),
      da: toISODate(anno, 1, 1),
      a: toISODate(anno, 12, 31),
      anno,
    });
  }
  return periodi;
};

/**
 * Mesi toccati dall'intervallo scelto in "Custom", estremi compresi.
 * Un intervallo di pochi giorni dentro lo stesso mese produce un solo periodo:
 * e' corretto, non un caso da correggere.
 */
const bucketIntervallo = (da, a) => {
  const inizio = new Date(`${String(da).slice(0, 10)}T00:00:00Z`);
  const fine = new Date(`${String(a).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(inizio.getTime()) || Number.isNaN(fine.getTime()) || inizio > fine) return [];

  const periodi = [];
  let cursore = new Date(Date.UTC(inizio.getUTCFullYear(), inizio.getUTCMonth(), 1));
  const ultimo = new Date(Date.UTC(fine.getUTCFullYear(), fine.getUTCMonth(), 1));

  while (cursore <= ultimo && periodi.length < MAX_PERIODI_CUSTOM) {
    periodi.push(bucketMese(cursore.getUTCFullYear(), cursore.getUTCMonth() + 1));
    cursore = new Date(Date.UTC(cursore.getUTCFullYear(), cursore.getUTCMonth() + 1, 1));
  }

  return periodi;
};

/**
 * Intervalli da confrontare.
 *
 * @param {object} opzioni
 * @param {string} [opzioni.unita]      'settimana' | 'mese' | 'anno' (default 'mese')
 * @param {number|string} [opzioni.quantita]  quanti periodi, da 2 a 12
 * @param {string} [opzioni.da]         con 'a': i mesi dell'intervallo, ignora unita/quantita
 * @param {string} [opzioni.a]
 * @param {Date} [oggi]                 istante di riferimento, iniettabile nei test
 * @returns {Array<{chiave, label, labelEsteso, da, a}>} dal piu' vecchio al piu' recente
 */
const buildPeriodi = ({ unita, quantita, da, a } = {}, oggi = new Date()) => {
  if (da && a) return bucketIntervallo(da, a);

  const n = normalizzaQuantita(quantita);
  const riferimento = new Date(Date.UTC(
    oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate(),
  ));

  switch (unita) {
    case 'settimana': return bucketSettimane(n, riferimento);
    case 'anno': return bucketAnni(n, riferimento);
    default: return bucketMesi(n, riferimento);
  }
};

module.exports = {
  buildPeriodi,
  normalizzaQuantita,
  UNITA_VALIDE,
  QUANTITA_MIN,
  QUANTITA_MAX,
  MAX_PERIODI_CUSTOM,
};
