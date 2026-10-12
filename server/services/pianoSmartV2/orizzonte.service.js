/**
 * L'orizzonte di spesa: entro quale termine il capitale deve bastare, e
 * quanto si può spendere al giorno perché basti.
 *
 * Service PURO: nessun modello, nessuna query, nessuna data di sistema.
 * Riceve già in centesimi interi ciò che gli serve e restituisce centesimi
 * interi (Regola 21). Chi lo chiama prepara gli ingressi.
 *
 * L'autocorrezione non è un meccanismo: è l'assenza di memoria. Il budget è
 * ricalcolato ogni giorno sul capitale REALE, quindi chi ieri ha speso meno
 * ha oggi più capitale e un giorno in meno su cui distribuirlo.
 */

const GIORNO_MS = 86400000;

/** Giorni fra due date ISO, inclusivi su entrambi gli estremi. Locale: non
 * serve un helper condiviso per una sottrazione di due giorni UTC. */
const giorniInclusivi = (da, a) => {
  const inizio = Date.parse(`${da}T00:00:00Z`);
  const fine = Date.parse(`${a}T00:00:00Z`);
  if (!Number.isFinite(inizio) || !Number.isFinite(fine)) return 0;
  const giorni = Math.round((fine - inizio) / GIORNO_MS) + 1;
  return giorni > 0 ? giorni : 0;
};

const sommaGiorniIso = (dataIso, giorni) => new Date(
  Date.parse(`${dataIso}T00:00:00Z`) + giorni * GIORNO_MS,
).toISOString().slice(0, 10);

function calcolaOrizzonte({
  tipo,
  dataFine,
  referenceDate,
  baseCents,
  impegniFinoACents,
  ritmoGiornalieroCents = null,
}) {
  const giorni = giorniInclusivi(referenceDate, dataFine);
  const vuoto = {
    tipo, dataFine, giorni,
    capitaleLibero: null,
    impegniFinoA: impegniFinoACents ?? null,
    budgetGiornaliero: null,
    stato: 'non_stimabile',
    mancanti: null,
    dataRaggiungibile: null,
  };
  if (giorni === 0 || baseCents === null || baseCents === undefined) return vuoto;
  if (impegniFinoACents === null || impegniFinoACents === undefined) return vuoto;

  const capitaleLibero = baseCents - impegniFinoACents;
  const scoperto = capitaleLibero < 0;
  // Un capitale negativo non si distribuisce: il budget è zero e l'ammontare
  // che manca è l'informazione utile al suo posto.
  const budgetGiornaliero = Math.floor(Math.max(capitaleLibero, 0) / giorni);

  let dataRaggiungibile = null;
  if (Number.isFinite(ritmoGiornalieroCents) && ritmoGiornalieroCents > 0) {
    const giorniSostenibili = Math.floor(Math.max(capitaleLibero, 0) / ritmoGiornalieroCents);
    // L'ultimo giorno coperto, non il primo scoperto: con un giorno
    // sostenibile la copertura finisce oggi.
    dataRaggiungibile = sommaGiorniIso(referenceDate, Math.max(giorniSostenibili - 1, 0));
  }

  return {
    tipo,
    dataFine,
    giorni,
    capitaleLibero,
    impegniFinoA: impegniFinoACents,
    budgetGiornaliero,
    stato: scoperto ? 'scoperto' : 'in_rotta',
    mancanti: scoperto ? -capitaleLibero : null,
    dataRaggiungibile,
  };
}

module.exports = { calcolaOrizzonte };
