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
  // Una data già passata non è un dato mancante: è una scelta da rifare.
  // Dirle "non stimabile" (il difetto 4 della review finale) è una
  // spiegazione falsa — i dati ci sono tutti, è la data a essere scaduta —
  // e non invita l'utente a cambiarla. Il confronto è sulla data, non su
  // `giorni === 0`: quel conteggio torna 0 anche per una data scaduta, ma è
  // un effetto, non la causa, e non deve essere l'unico modo di saperlo.
  const scaduto = dataFine < referenceDate;
  const vuoto = {
    tipo, dataFine, giorni,
    capitaleLibero: null,
    impegniFinoA: impegniFinoACents ?? null,
    budgetGiornaliero: null,
    stato: scaduto ? 'scaduto' : 'non_stimabile',
    mancanti: null,
    dataRaggiungibile: null,
  };
  if (scaduto || giorni === 0 || baseCents === null || baseCents === undefined) return vuoto;
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
  // Un capitale che basta non vuol dire "al ritmo giusto": se al ritmo
  // attuale il capitale si esaurirebbe prima del termine scelto
  // (`dataRaggiungibile < dataFine`), il piano non è "in rotta" — è in
  // ritardo. Guardare solo il segno del capitale libero (difetto 3 della
  // review finale) confondeva questi due stati in chi mostra il risultato:
  // l'hero arrivava a disegnare insieme l'avviso "arrivi prima" e
  // l'etichetta verde "in rotta", perché erano due catene indipendenti che
  // guardavano informazioni diverse.
  const inRitardo = !scoperto && dataRaggiungibile !== null && dataRaggiungibile < dataFine;

  return {
    tipo,
    dataFine,
    giorni,
    capitaleLibero,
    impegniFinoA: impegniFinoACents,
    budgetGiornaliero,
    stato: scoperto ? 'scoperto' : inRitardo ? 'in_ritardo' : 'in_rotta',
    mancanti: scoperto ? -capitaleLibero : null,
    dataRaggiungibile,
  };
}

module.exports = { calcolaOrizzonte };
