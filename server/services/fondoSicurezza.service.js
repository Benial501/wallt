const { aggregaSpeseMesi } = require('./spese.service');
const { Movimento } = require('../models');

const toNumber = (val) => parseFloat(val) || 0;
const round1 = (val) => Math.round(val * 10) / 10;

/**
 * mesiCopertura = importoFondo / speseEssenzialiMensili, calcolate sulla
 * media delle spese essenziali negli ultimi `mesi` mesi solari completi
 * (esclude il mese corrente, ancora parziale).
 *
 * Casi limite (nessun valore inventato quando i dati non bastano):
 * - nessun movimento di uscita nel periodo → 'dati_insufficienti'
 * - c'e' storico ma nessuna spesa e' classificata 'essenziale' → 'non_calcolabile'
 *   (dividere per zero non ha senso)
 * - fondo vuoto (importo_attuale=0) con spese essenziali > 0 → 'disponibile',
 *   mesi_copertura=0 (e' un risultato legittimo, non un errore)
 * - obiettivo completato → nessun trattamento speciale, la formula si applica
 *   comunque con l'importo_attuale corrente
 *
 * Copertura e semi-essenziali: il fondo copre solo le spese 'essenziale',
 * mai le 'semi_essenziale' (comprimibili in caso di necessità, per
 * definizione — vedi essenzialita.service.js — quindi non richiedono una
 * riserva dedicata) né le 'non_classificata'. Non è un'omissione: è la
 * regola esplicita adottata qui, 0% delle semi-essenziali, senza percentuali
 * arbitrarie.
 *
 * `classificazione_incompleta: true` nella risposta segnala che una quota
 * non trascurabile (>1%) delle uscite nel periodo non ha una categoria con
 * essenzialità valida: `spese_essenziali_mensili` potrebbe essere
 * sottostimata, perché quella quota non entra mai nel totale essenziale.
 *
 * Finestra e aggregazione. La finestra resta quella specifica del fondo —
 * `mesi` (default 3) mesi civili COMPLETI, mese corrente escluso — ma non è
 * più calcolata qui: si chiede a `aggregaSpeseMesi` una finestra di `mesi + 1`
 * mesi (i `mesi` completi più quello in corso) e si usa la sua
 * classificazione dei mesi completi e la sua `byNecessityMesiCompleti`. Così
 * la distribuzione per essenzialità è la stessa che vede il resto dell'app,
 * e il periodo effettivamente osservato viene restituito in `periodo`
 * invece di restare implicito nel codice.
 */
async function calcolaMesiCopertura({ userId, obiettivo, mesi = 3, riferimento = new Date() }) {
  const importoFondo = toNumber(obiettivo.importo_attuale);
  // mesi + 1: la finestra richiesta comprende il mese corrente, che
  // aggregaSpeseMesi marca parziale e tiene fuori dai mesi completi.
  const movimentiStorici = await Movimento.findAll({
    where: { user_id: userId }, order: [['data', 'ASC']], attributes: ['data', 'descrizione'],
  });
  const primo = movimentiStorici.find((m) => m.descrizione !== 'Saldo iniziale');
  const aggregato = await aggregaSpeseMesi(userId, mesi + 1, riferimento, {
    primoMovimento: primo ? String(primo.data).slice(0, 10) : null,
  });
  const completi = aggregato.finestra.completi;
  const periodo = {
    da: completi[0] ?? null,
    a: completi[completi.length - 1] ?? null,
    mesi: completi.length,
  };
  const periodoRichiesto = { da: aggregato.finestra.richiesta.da, a: aggregato.finestra.richiesta.a, mesi };

  if (aggregato.totale_mesi_completi === 0) {
    return {
      stato: 'dati_insufficienti',
      mesi_copertura: null,
      spese_essenziali_mensili: null,
      importo_fondo: importoFondo,
      periodo,
      mesi_richiesti: mesi,
      mesi_utilizzati: 0,
      storico_limitato: true,
      periodo_richiesto: periodoRichiesto,
      classificazione_incompleta: false,
      motivo: 'Nessuno storico di spese sufficiente per calcolare la copertura.',
    };
  }

  const {
    essenziale, non_classificata: nonClassificata, totale,
  } = aggregato.byNecessityMesiCompleti;
  const mesiUtilizzati = aggregato.finestra.completi.length;
  const speseEssenzialiMensili = essenziale / mesiUtilizzati;
  const storicoLimitato = mesiUtilizzati < mesi;
  // Vero solo se manca almeno una classificazione E quella spesa non è
  // trascurabile: pochi centesimi non classificati su un totale alto non
  // meritano di marcare l'intera stima come incompleta.
  const classificazioneIncompleta = nonClassificata > 0 && totale > 0
    && (nonClassificata / totale) > 0.01;

  if (speseEssenzialiMensili === 0) {
    return {
      stato: 'non_calcolabile',
      mesi_copertura: null,
      spese_essenziali_mensili: 0,
      importo_fondo: importoFondo,
      periodo,
      mesi_richiesti: mesi,
      mesi_utilizzati: mesiUtilizzati,
      storico_limitato: storicoLimitato,
      periodo_richiesto: periodoRichiesto,
      motivo: 'Le spese essenziali mensili sono pari a zero: la copertura non è calcolabile.',
      classificazione_incompleta: classificazioneIncompleta,
    };
  }

  return {
    stato: 'disponibile',
    mesi_copertura: round1(importoFondo / speseEssenzialiMensili),
    spese_essenziali_mensili: Math.round(speseEssenzialiMensili * 100) / 100,
    importo_fondo: importoFondo,
    periodo,
    mesi_richiesti: mesi,
    mesi_utilizzati: mesiUtilizzati,
    storico_limitato: storicoLimitato,
    periodo_richiesto: periodoRichiesto,
    motivo: null,
    // true quando una parte non trascurabile delle uscite nel periodo non ha
    // una categoria classificata (id orfano o senza essenzialita valida):
    // la stima delle spese essenziali potrebbe essere sottostimata, perché
    // NON_CLASSIFICATA non entra mai in `essenziale` (vedi essenzialita.service.js).
    classificazione_incompleta: classificazioneIncompleta,
  };
}

module.exports = { calcolaMesiCopertura };
