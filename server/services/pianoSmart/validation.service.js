/**
 * Validazione matematica di un Piano Smart.
 *
 * Due usi distinti, con conseguenze diverse, e la differenza è deliberata:
 *
 * - `assertInvariantiMotore`: controlla ciò che il motore ha appena prodotto.
 *   Una violazione qui è un BUG del motore, non un errore dell'utente: lancia,
 *   così finisce nei log e nei test invece di raggiungere l'interfaccia come
 *   una ripartizione plausibile e sbagliata. Non corregge niente in silenzio.
 * - `validaAllocazioniFinali`: controlla ciò che l'utente ha modificato. Una
 *   violazione qui è un input non valido: ritorna l'elenco degli errori in
 *   italiano, perché è il controller a doverli restituire con un 400.
 *
 * Nessuna delle due funzione tocca il database o fa I/O.
 */
const { CATEGORIE } = require('../../constants/pianoSmart');
const { fromCents } = require('./money');

/** Tolleranza sulla somma delle percentuali: cinque valori arrotondati a due
 * decimali possono discostarsi al massimo di 0,025 da 100. 0,1 è il margine
 * dichiarato, con abbondanza. */
const TOLLERANZA_PERCENTUALI = 0.1;

const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Verifica gli invarianti su un insieme di allocazioni in centesimi.
 *
 * @param {Object} params
 * @param {Array<{category:string, cents:number, percentage:?number}>} params.allocazioni
 * @param {number} params.allocatableCents
 * @param {Object} params.caps - cap per categoria, `null` = nessun limite
 * @returns {string[]} elenco delle violazioni, vuoto se tutto torna
 */
const verificaInvarianti = ({ allocazioni, allocatableCents, caps = {} }) => {
  const violazioni = [];

  if (!Number.isInteger(allocatableCents) || allocatableCents < 0) {
    violazioni.push('Il capitale allocabile non è un numero intero di centesimi non negativo.');
    return violazioni;
  }

  const categorie = allocazioni.map((a) => a.category);
  const mancanti = CATEGORIE.filter((c) => !categorie.includes(c));
  const sconosciute = categorie.filter((c) => !CATEGORIE.includes(c));
  const duplicate = categorie.filter((c, i) => categorie.indexOf(c) !== i);
  if (mancanti.length > 0) violazioni.push(`Categorie mancanti: ${mancanti.join(', ')}.`);
  if (sconosciute.length > 0) violazioni.push(`Categorie non riconosciute: ${sconosciute.join(', ')}.`);
  if (duplicate.length > 0) violazioni.push(`Categorie ripetute: ${[...new Set(duplicate)].join(', ')}.`);
  if (violazioni.length > 0) return violazioni;

  allocazioni.forEach((a) => {
    if (!Number.isInteger(a.cents)) {
      violazioni.push(`La quota di ${a.category} non è un numero intero di centesimi.`);
    } else if (a.cents < 0) {
      violazioni.push(`La quota di ${a.category} è negativa.`);
    }
  });
  if (violazioni.length > 0) return violazioni;

  // L'invariante centrale: uguaglianza ESATTA fra interi, non "a meno di un
  // epsilon". È l'unico motivo per cui il motore lavora in centesimi.
  const somma = allocazioni.reduce((s, a) => s + a.cents, 0);
  if (somma !== allocatableCents) {
    violazioni.push(
      `La somma delle quote (${fromCents(somma)}) non coincide con il capitale `
      + `da distribuire (${fromCents(allocatableCents)}).`,
    );
  }

  Object.entries(caps).forEach(([categoria, limite]) => {
    if (!numeroValido(limite)) return;
    const riga = allocazioni.find((a) => a.category === categoria);
    if (riga && riga.cents > limite) {
      violazioni.push(
        `La quota di ${categoria} (${fromCents(riga.cents)}) supera il limite `
        + `di ${fromCents(limite)}.`,
      );
    }
  });

  const percentuali = allocazioni.map((a) => a.percentage);
  const tutteNulle = percentuali.every((p) => p === null || p === undefined);
  if (allocatableCents === 0) {
    if (!tutteNulle) {
      violazioni.push('A capitale zero le percentuali devono essere assenti, non zero.');
    }
  } else if (tutteNulle) {
    violazioni.push('Le percentuali sono assenti nonostante il capitale sia maggiore di zero.');
  } else {
    const totale = percentuali.reduce((s, p) => s + (numeroValido(p) ? p : 0), 0);
    if (Math.abs(totale - 100) > TOLLERANZA_PERCENTUALI) {
      violazioni.push(`La somma delle percentuali (${totale}) non è 100.`);
    }
  }

  return violazioni;
};

/**
 * Autocontrollo del motore sul piano raccomandato. Lancia se qualcosa non
 * torna: un piano matematicamente sbagliato non deve poter uscire da qui.
 */
const assertInvariantiMotore = (piano) => {
  const violazioni = verificaInvarianti({
    allocazioni: piano.allocations.map((a) => ({
      category: a.category,
      cents: a.recommendedCents,
      percentage: a.recommendedPercentage,
    })),
    allocatableCents: piano.allocatableCents,
    caps: piano.caps || {},
  });

  // Il breakdown per obiettivo ha un invariante suo: la somma dei singoli
  // obiettivi è la quota goals, e nessun obiettivo riceve più del suo restante.
  const goals = piano.allocations.find((a) => a.category === 'goals');
  const dettaglio = goals?.metadata?.goals || [];
  if (dettaglio.length > 0) {
    const sommaObiettivi = dettaglio.reduce((s, g) => s + g.amountCents, 0);
    if (sommaObiettivi !== goals.recommendedCents) {
      violazioni.push(
        `La somma degli obiettivi (${fromCents(sommaObiettivi)}) non coincide con `
        + `la quota goals (${fromCents(goals.recommendedCents)}).`,
      );
    }
    dettaglio.forEach((g) => {
      if (g.amountCents > g.remainingCents) {
        violazioni.push(`All'obiettivo ${g.id} è stato assegnato più del suo restante.`);
      }
    });
  }

  if (violazioni.length > 0) {
    const errore = new Error(`Invarianti del Piano Smart violati: ${violazioni.join(' ')}`);
    errore.violazioni = violazioni;
    throw errore;
  }
  return true;
};

/**
 * Valida le allocazioni finali scelte dall'utente.
 *
 * I cap restano in vigore anche sulle scelte manuali: assegnare a `goals` più
 * di quanto gli obiettivi debbano ancora raggiungere, o a `safety` più del gap
 * del fondo, non è una preferenza — è denaro destinato a un traguardo che non
 * esiste. Il messaggio dice qual è il limite, così l'interfaccia può guidare la
 * correzione invece di limitarsi a rifiutare.
 *
 * @returns {{valido:boolean, errori:string[]}}
 */
const validaAllocazioniFinali = ({ allocazioni, allocatableCents, caps = {} }) => {
  const errori = verificaInvarianti({ allocazioni, allocatableCents, caps });
  return { valido: errori.length === 0, errori };
};

module.exports = {
  TOLLERANZA_PERCENTUALI,
  verificaInvarianti,
  assertInvariantiMotore,
  validaAllocazioniFinali,
};
