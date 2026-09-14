/**
 * Statistiche di una piattaforma scommesse.
 *
 * Regola di base: depositi e prelievi sono SPOSTAMENTI di denaro fra il conto
 * corrente e il conto di gioco, non risultati di giocate. Non entrano quindi
 * nel bilancio di vincite e perdite: se carico 11 € e li perdo, la perdita è
 * 11 €, non 22 €.
 *
 * Il risultato di gioco è solo: vincite - perdite.
 * Lo spostamento netto di denaro (prelievi - depositi) resta disponibile a
 * parte, come `saldo_trasferimenti`.
 */

const toNumber = (val) => parseFloat(val) || 0;

const arrotonda = (val) => Math.round(val * 100) / 100;

const calcolaStatsMovimenti = (movimenti = []) => {
  let totaleDepositato = 0;
  let totalePrelevato = 0;
  let totaleVincite = 0;
  let totalePerdite = 0;

  movimenti.forEach((m) => {
    const imp = toNumber(m.importo);
    if (m.tipo === 'deposito') totaleDepositato += imp;
    if (m.tipo === 'prelievo') totalePrelevato += imp;
    if (m.tipo === 'vincita') totaleVincite += imp;
    if (m.tipo === 'perdita') totalePerdite += imp;
  });

  const risultatoGioco = arrotonda(totaleVincite - totalePerdite);
  const saldoTrasferimenti = arrotonda(totalePrelevato - totaleDepositato);
  const depositato = arrotonda(totaleDepositato);

  const roiPercentuale = depositato > 0
    ? Math.round((risultatoGioco / depositato) * 10000) / 100
    : 0;

  return {
    totale_depositato: depositato,
    totale_prelevato: arrotonda(totalePrelevato),
    totale_vincite: arrotonda(totaleVincite),
    totale_perdite: arrotonda(totalePerdite),
    // Quanto denaro si è mosso fra conto corrente e conto di gioco.
    saldo_trasferimenti: saldoTrasferimenti,
    // Il vero risultato delle giocate.
    risultato_gioco: risultatoGioco,
    // Alias storici, tutti allineati al risultato di gioco.
    bilancio: risultatoGioco,
    bilancio_display: risultatoGioco,
    bilancio_reale: risultatoGioco,
    bilancio_netto: risultatoGioco,
    roi_percentuale: roiPercentuale,
  };
};

/**
 * Somma le statistiche di più piattaforme mantenendo le stesse regole.
 */
const sommaStats = (listaStats = []) => {
  const totali = listaStats.reduce((acc, s) => ({
    totale_depositato: acc.totale_depositato + toNumber(s.totale_depositato),
    totale_prelevato: acc.totale_prelevato + toNumber(s.totale_prelevato),
    totale_vincite: acc.totale_vincite + toNumber(s.totale_vincite),
    totale_perdite: acc.totale_perdite + toNumber(s.totale_perdite),
  }), {
    totale_depositato: 0, totale_prelevato: 0, totale_vincite: 0, totale_perdite: 0,
  });

  const risultatoGioco = arrotonda(totali.totale_vincite - totali.totale_perdite);
  const depositato = arrotonda(totali.totale_depositato);

  return {
    totale_depositato: depositato,
    totale_prelevato: arrotonda(totali.totale_prelevato),
    totale_vincite: arrotonda(totali.totale_vincite),
    totale_perdite: arrotonda(totali.totale_perdite),
    saldo_trasferimenti: arrotonda(totali.totale_prelevato - totali.totale_depositato),
    risultato_gioco: risultatoGioco,
    bilancio: risultatoGioco,
    bilancio_display: risultatoGioco,
    bilancio_reale: risultatoGioco,
    bilancio_netto: risultatoGioco,
    roi_percentuale: depositato > 0
      ? Math.round((risultatoGioco / depositato) * 10000) / 100
      : 0,
  };
};

module.exports = { calcolaStatsMovimenti, sommaStats, toNumber, arrotonda };
