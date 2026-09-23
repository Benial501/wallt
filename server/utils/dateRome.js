/**
 * Utility condivisa per i calcoli finanziari temporali nel fuso applicativo
 * ufficiale (Europe/Rome, vedi CLAUDE.md § Date e timezone).
 *
 * Non reinventa nulla: si appoggia alle primitive già esistenti e testate in
 * `services/notifiche/notificheTime.js` (Intl.DateTimeFormat, nessuna
 * dipendenza aggiuntiva, DST-safe) e aggiunge solo i calcoli di calendario
 * (mese, finestre, mesi rimanenti) che servono fuori dal dominio notifiche:
 * analisi/confronto periodi, obiettivi, entrate, fondo sicurezza.
 *
 * Distinzione importante: una volta noto il giorno civile "di oggi" nel fuso
 * dell'utente (`oggiLocale`), tutta l'aritmetica di calendario successiva
 * (fine mese, somma mesi, finestre) opera su stringhe 'YYYY-MM-DD' o su
 * `Date` ancorate a UTC usate come puro contenitore di giorno civile — non
 * c'è più conversione di fuso da fare, perché una data civile non è un
 * istante. Il fuso conta solo per stabilire QUAL è il giorno civile
 * corrente a partire da un istante (`new Date()`), non nell'aritmetica fra
 * giorni civili già noti.
 */

const {
  FUSO_DEFAULT,
  fusoValido,
  partiLocali,
  giornoLocale,
  sommaGiorni,
} = require('../services/notifiche/notificheTime');

/** 'YYYY-MM-DD' del giorno civile corrente nel fuso indicato (default Europe/Rome). */
const oggiLocale = (timeZone = FUSO_DEFAULT, date = new Date()) => giornoLocale(date, timeZone);

/** Ultimo giorno del mese (mese 1-based), calcolo di calendario puro. */
const ultimoGiornoDelMese = (anno, mese) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

/** Primo giorno del mese di `dataIso` ('YYYY-MM-DD' -> 'YYYY-MM-01'). */
const inizioMese = (dataIso) => `${String(dataIso).slice(0, 7)}-01`;

/** Ultimo giorno del mese di `dataIso`, gestisce correttamente i bisestili. */
const fineMese = (dataIso) => {
  const [anno, mese] = String(dataIso).split('-').map(Number);
  const ultimo = ultimoGiornoDelMese(anno, mese);
  return `${anno}-${String(mese).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
};

/**
 * Somma `mesi` (anche negativi) a `dataIso`, con clamp del giorno al fine
 * mese risultante quando il mese di partenza non esiste in quello di arrivo
 * (es. 31 gennaio + 1 mese = 28/29 febbraio, mai un 31 febbraio inesistente).
 */
const sommaMesi = (dataIso, mesi) => {
  const [anno, mese, giorno] = String(dataIso).split('-').map(Number);
  const totMesi = (mese - 1) + mesi;
  const nuovoAnno = anno + Math.floor(totMesi / 12);
  const nuovoMese = (((totMesi % 12) + 12) % 12) + 1;
  const ultimo = ultimoGiornoDelMese(nuovoAnno, nuovoMese);
  const nuovoGiorno = Math.min(giorno, ultimo);
  return `${nuovoAnno}-${String(nuovoMese).padStart(2, '0')}-${String(nuovoGiorno).padStart(2, '0')}`;
};

/**
 * Finestra di `giorni` giorni civili che termina, inclusa, in
 * `dataIsoRiferimento` (tipicamente "oggi"). Con giorni=30 e riferimento
 * oggi, `da` è il giorno tale per cui l'intervallo [da, a] contiene
 * esattamente 30 giorni civili, oggi compreso — non "oggi meno 30 giorni".
 */
const finestraGiorni = (dataIsoRiferimento, giorni) => ({
  da: sommaGiorni(dataIsoRiferimento, -(giorni - 1)),
  a: dataIsoRiferimento,
});

/**
 * Mesi interi pieni fra `dataIsoInizio` e `dataIsoScadenza` (>= 0).
 *
 * Un mese conta come pieno solo se il giorno di `dataIsoScadenza` è >= al
 * giorno di `dataIsoInizio` (stesso criterio con cui si contano gli anni di
 * età): dal 23 settembre al 3 ottobre è 0 mesi interi, non 1, perché il
 * giorno 3 è già passato rispetto al 23. Una scadenza uguale o precedente a
 * `dataIsoInizio` (mese corrente, oggi, o già scaduta) restituisce 0: sta
 * al chiamante distinguere "0 perché scade questo mese/oggi" da "0 perché è
 * già scaduta" confrontando le due date iso direttamente.
 */
const mesiRimanenti = (dataIsoInizio, dataIsoScadenza) => {
  if (!dataIsoScadenza || String(dataIsoScadenza) <= String(dataIsoInizio)) return 0;
  const [annoI, meseI, giornoI] = String(dataIsoInizio).split('-').map(Number);
  const [annoF, meseF, giornoF] = String(dataIsoScadenza).split('-').map(Number);
  let mesi = (annoF - annoI) * 12 + (meseF - meseI);
  if (giornoF < giornoI) mesi -= 1;
  return Math.max(0, mesi);
};

module.exports = {
  FUSO_DEFAULT,
  fusoValido,
  partiLocali,
  giornoLocale,
  sommaGiorni,
  oggiLocale,
  inizioMese,
  fineMese,
  ultimoGiornoDelMese,
  sommaMesi,
  finestraGiorni,
  mesiRimanenti,
};
