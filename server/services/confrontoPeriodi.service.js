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
const MESI_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Unita' che ammettono un numero di periodi scelto dall'utente. */
const UNITA_VALIDE = ['giorno', 'settimana', 'mese', 'anno'];

/** Estremi del selettore "quante ne confronto". */
const QUANTITA_MIN = 2;
const QUANTITA_MAX = 12;

/**
 * Tetto per unita'. Il grafico dell'andamento chiede fino a 30 giorni, ma
 * alzare un tetto unico a 31 renderebbe legali anche 31 anni: il selettore
 * del confronto nelle Analisi resta a 12 per settimane, mesi e anni.
 */
const QUANTITA_MAX_PER_UNITA = {
  giorno: 31,
  settimana: QUANTITA_MAX,
  mese: QUANTITA_MAX,
  anno: QUANTITA_MAX,
};

/** Tetto di sicurezza sui mesi restituiti da un intervallo custom molto ampio. */
const MAX_PERIODI_CUSTOM = 24;

/**
 * `oggi` arriva come istante (`new Date()` sul chiamante, spesso senza
 * passarlo esplicitamente: vedi il default di `buildPeriodi`). Sul processo
 * Vercel l'istante gira in UTC, ma il giorno civile "di oggi" per l'utente
 * va deciso nel fuso applicativo (Europe/Rome, vedi CLAUDE.md § Date e
 * timezone): vicino alla mezzanotte i due fusi possono disaccordare sul
 * giorno. Da qui in poi il file lavora comunque su `Date` ancorate a UTC
 * come puro contenitore di giorno civile: non serve altra conversione di
 * fuso, perché l'unica domanda "che fuso ha l'istante di partenza" è già
 * risolta qui.
 */
const { partiLocali, FUSO_DEFAULT } = require('../utils/dateRome');
const riferimentoLocale = (oggi) => {
  const { anno, mese, giorno } = partiLocali(oggi, FUSO_DEFAULT);
  return new Date(Date.UTC(anno, mese - 1, giorno));
};

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

/**
 * Normalizza la quantita' richiesta dentro gli estremi dell'unita'.
 *
 * `unita` e' opzionale: senza, vale il tetto storico di 12. E' la firma che
 * usavano le Analisi prima del bucket giornaliero, e i chiamanti che non
 * passano l'unita' devono continuare a ottenere il comportamento di prima.
 */
const normalizzaQuantita = (valore, unita, fallback = 6) => {
  const massimo = QUANTITA_MAX_PER_UNITA[unita] ?? QUANTITA_MAX;
  const n = parseInt(valore, 10);
  if (!Number.isFinite(n)) return Math.min(massimo, fallback);
  return Math.min(massimo, Math.max(QUANTITA_MIN, n));
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

/**
 * Un punto per giorno. Serve al grafico dell'andamento del patrimonio, dove
 * "7 giorni" e "30 giorni" sono le finestre che si guardano piu' spesso.
 */
const bucketGiorni = (quantita, oggi) => {
  const periodi = [];

  for (let i = quantita - 1; i >= 0; i--) {
    const giorno = new Date(oggi);
    giorno.setUTCDate(giorno.getUTCDate() - i);
    const iso = giorno.toISOString().slice(0, 10);

    periodi.push({
      chiave: iso,
      // Etichetta corta per l'asse, estesa per il tooltip: su 30 punti
      // l'asse non ha spazio per il nome intero del mese.
      label: `${giorno.getUTCDate()} ${MESI_SHORT[giorno.getUTCMonth()].toLowerCase()}`,
      labelEsteso: `${giorno.getUTCDate()} ${MESI_LONG[giorno.getUTCMonth()]} ${giorno.getUTCFullYear()}`,
      da: iso,
      a: iso,
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
 * @param {string} [opzioni.unita]      'giorno' | 'settimana' | 'mese' | 'anno' (default 'mese')
 * @param {number|string} [opzioni.quantita]  quanti periodi, entro il tetto dell'unita'
 * @param {string} [opzioni.da]         con 'a': i mesi dell'intervallo, ignora unita/quantita
 * @param {string} [opzioni.a]
 * @param {Date} [oggi]                 istante di riferimento, iniettabile nei test
 * @returns {Array<{chiave, label, labelEsteso, da, a}>} dal piu' vecchio al piu' recente
 */
const buildPeriodi = ({ unita, quantita, da, a } = {}, oggi = new Date()) => {
  if (da && a) return bucketIntervallo(da, a);

  const n = normalizzaQuantita(quantita, unita);
  const riferimento = riferimentoLocale(oggi);

  switch (unita) {
    case 'giorno': return bucketGiorni(n, riferimento);
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
  QUANTITA_MAX_PER_UNITA,
  MAX_PERIODI_CUSTOM,
};
