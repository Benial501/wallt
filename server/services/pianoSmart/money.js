/**
 * Primitive monetarie di Piano Smart.
 *
 * Il motore lavora ESCLUSIVAMENTE in centesimi interi: gli euro esistono solo
 * al confine di serializzazione. Non è pedanteria — `0.1 + 0.2 !== 0.3` in
 * floating point, e l'invariante di Piano Smart è che la somma delle cinque
 * allocazioni sia *esattamente* il capitale allocabile, non "uguale a meno di
 * un epsilon". Un'uguaglianza esatta su interi è verificabile; una su float
 * non lo è.
 *
 * Nessuna dipendenza: né Sequelize, né Express, né le constants. Serve a
 * poterle testare (e usare) senza database.
 */

/** Massimo rappresentabile da DECIMAL(12,2), cioè 9999999999.99 in centesimi.
 * Oltre questo valore la colonna non accetterebbe la scrittura: rifiutare
 * qui è meglio che scoprirlo con un errore Postgres a metà transazione. */
const MAX_CENTESIMI = 999999999999;

/** Un importo è al massimo 10 cifre intere e al massimo 2 decimali, con la
 * virgola ammessa come separatore (input italiano). Niente segno, niente
 * notazione esponenziale: '8e3' non è un importo scritto da un essere umano. */
const FORMATO_IMPORTO = /^(\d{1,10})(?:[.,](\d{1,2}))?$/;

/**
 * Converte un importo (stringa o numero) in centesimi interi.
 *
 * Ritorna `null` — mai un'eccezione, mai un valore corretto d'ufficio — per
 * qualunque input che non sia un importo valido: stringa vuota, testo,
 * negativo, NaN, Infinity, booleano, array, oggetto, e in particolare **più di
 * due decimali**. `1.005` non viene arrotondato a `1.01`: è un input che
 * nessuno può interpretare con certezza, quindi viene rifiutato. Arrotondarlo
 * in silenzio significherebbe decidere al posto dell'utente su una cifra di
 * denaro.
 *
 * I numeri passano per `String(value)` e non per `value * 100`: la seconda
 * strada su 800.07 dà 80006.99999999999, e `Math.round` la salverebbe solo
 * per caso.
 */
const toCents = (value) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    // Un numero che JS serializza in notazione esponenziale (1e21) o con più
    // di due decimali non passa il formato: il controllo è uno solo, quello
    // sulla stringa.
    return toCents(String(value));
  }
  if (typeof value !== 'string') return null;

  const match = FORMATO_IMPORTO.exec(value.trim());
  if (!match) return null;

  const interi = Number(match[1]);
  const decimali = Number((match[2] || '').padEnd(2, '0') || '0');
  const centesimi = interi * 100 + decimali;
  if (!Number.isSafeInteger(centesimi) || centesimi > MAX_CENTESIMI) return null;
  return centesimi;
};

const isImportoValido = (value) => toCents(value) !== null;

/**
 * Serializza centesimi interi in una stringa decimale con esattamente due
 * decimali (`80000 → "800.00"`).
 *
 * È la rappresentazione monetaria dell'intero namespace Piano Smart in
 * risposta API: una stringa non ha arrotondamenti impliciti e permette al
 * client di verificare la somma senza aritmetica float.
 *
 * Lancia su input non validi: un chiamante interno che passa 1.5 centesimi ha
 * un bug, e mascherarlo con un arrotondamento lo nasconderebbe.
 */
const fromCents = (centesimi) => {
  if (!Number.isInteger(centesimi) || centesimi < 0) {
    throw new Error(`Centesimi non validi: ${centesimi}`);
  }
  const interi = Math.trunc(centesimi / 100);
  const resto = centesimi % 100;
  return `${interi}.${String(resto).padStart(2, '0')}`;
};

/**
 * Ripartizione al resto maggiore (Hamilton) di `totaleCent` fra le categorie,
 * in proporzione ai pesi.
 *
 * Perché non `Math.round(peso / somma * totale)` per ciascuna: cinque
 * arrotondamenti indipendenti sbagliano la somma di 1-2 centesimi nella
 * maggior parte dei casi, e l'invariante `somma == totale` salterebbe. Qui si
 * assegna la parte intera a tutti e poi si distribuisce il resto, un centesimo
 * per volta, alle frazioni più grandi: la somma torna per costruzione.
 *
 * Lo spareggio a frazioni identiche è l'ORDINE ricevuto, non l'ordine delle
 * chiavi dell'oggetto: è ciò che rende il risultato deterministico e non
 * dipendente dall'ordine di inserimento delle proprietà.
 *
 * Con somma dei pesi zero (caso che il motore non produce, ma che una
 * chiamata futura potrebbe) tutto va alla prima categoria dell'ordine: mai
 * `NaN`, mai una somma diversa dal totale.
 */
const ripartisciCentesimi = (pesi, totaleCent, ordine) => {
  if (!Number.isInteger(totaleCent) || totaleCent < 0) {
    throw new Error(`Totale non valido: ${totaleCent}`);
  }
  if (!Array.isArray(ordine) || ordine.length === 0) {
    throw new Error('Ordine delle categorie obbligatorio');
  }

  const valori = ordine.map((chiave) => Math.max(Number(pesi[chiave]) || 0, 0));
  const sommaPesi = valori.reduce((s, v) => s + v, 0);

  const esito = {};
  if (sommaPesi === 0) {
    ordine.forEach((chiave) => { esito[chiave] = 0; });
    esito[ordine[0]] = totaleCent;
    return esito;
  }

  const frazioni = [];
  let assegnato = 0;
  ordine.forEach((chiave, indice) => {
    const esatto = (valori[indice] * totaleCent) / sommaPesi;
    const base = Math.floor(esatto);
    esito[chiave] = base;
    assegnato += base;
    frazioni.push({ chiave, frazione: esatto - base, indice });
  });

  let resto = totaleCent - assegnato;
  frazioni.sort((a, b) => (b.frazione - a.frazione) || (a.indice - b.indice));
  for (let i = 0; resto > 0; i += 1, resto -= 1) {
    esito[frazioni[i % frazioni.length].chiave] += 1;
  }
  return esito;
};

/**
 * Percentuale di `centesimi` su `totaleCent`, due decimali.
 *
 * `null` quando il totale è zero: una quota di un capitale inesistente non è
 * lo 0%, è una percentuale che non esiste. È la ragione per cui le colonne
 * `*_percentage` sono nullable (vedi la migration).
 */
const percentuale = (centesimi, totaleCent) => {
  if (!Number.isInteger(centesimi) || !Number.isInteger(totaleCent)) {
    throw new Error('Percentuale richiede centesimi interi');
  }
  if (totaleCent === 0) return null;
  return Math.round((centesimi / totaleCent) * 10000) / 100;
};

module.exports = {
  MAX_CENTESIMI,
  toCents,
  fromCents,
  isImportoValido,
  ripartisciCentesimi,
  percentuale,
};
