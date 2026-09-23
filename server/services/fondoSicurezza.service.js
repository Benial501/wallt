const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { list } = require('./categorie.service');
const { aggregaPerEssenzialita } = require('./essenzialita.service');
const { getRomeDateParts } = require('./ricorrenti.service');

const toNumber = (val) => parseFloat(val) || 0;
const round1 = (val) => Math.round(val * 10) / 10;
const pad2 = (n) => String(n).padStart(2, '0');

/** Primo giorno del mese, N mesi indietro rispetto a `riferimento`, nel
 * calendario di Roma (mai in quello del processo, che su Vercel e' UTC:
 * CLAUDE.md regola #16). */
const inizioMesiFa = (riferimento, n) => {
  const [anno, mese] = getRomeDateParts(riferimento).period.split('-').map(Number);
  let y = anno;
  let m = mese - n;
  while (m <= 0) { m += 12; y -= 1; }
  return `${y}-${pad2(m)}-01`;
};

/** Ultimo giorno del mese precedente a `riferimento` (esclude il mese corrente,
 * ancora parziale, per non far apparire le spese essenziali piu' basse di
 * quanto sono davvero), nel calendario di Roma. */
const fineMeseScorso = (riferimento) => {
  const [anno, mese] = getRomeDateParts(riferimento).period.split('-').map(Number);
  let y = anno;
  let m = mese - 1;
  if (m <= 0) { m = 12; y -= 1; }
  // Date.UTC(y, m, 0) usa `m` come indice di mese 0-based: passandogli il
  // nostro `m` 1-based si ottiene il mese successivo in JS, il cui giorno 0
  // e' l'ultimo giorno del mese `m` che vogliamo (calcolo timezone-neutro).
  const ultimoGiorno = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-${pad2(ultimoGiorno)}`;
};

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
 */
async function calcolaMesiCopertura({ userId, obiettivo, mesi = 3, riferimento = new Date() }) {
  const importoFondo = toNumber(obiettivo.importo_attuale);
  const da = inizioMesiFa(riferimento, mesi);
  const a = fineMeseScorso(riferimento);

  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      data: { [Op.between]: [da, a] },
    },
  });

  if (movimenti.length === 0) {
    return {
      stato: 'dati_insufficienti',
      mesi_copertura: null,
      spese_essenziali_mensili: null,
      importo_fondo: importoFondo,
      motivo: 'Nessuno storico di spese sufficiente per calcolare la copertura.',
    };
  }

  const spesoPerCategoria = {};
  movimenti.forEach((m) => {
    const cat = m.categoria || 'altro_uscita';
    spesoPerCategoria[cat] = (spesoPerCategoria[cat] || 0) + toNumber(m.importo);
  });

  const categorie = await list(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const {
    essenziale, non_classificata: nonClassificata, totale,
  } = aggregaPerEssenzialita(spesoPerCategoria, categorieUscita);
  const speseEssenzialiMensili = essenziale / mesi;
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
      motivo: 'Le spese essenziali mensili sono pari a zero: la copertura non è calcolabile.',
      classificazione_incompleta: classificazioneIncompleta,
    };
  }

  return {
    stato: 'disponibile',
    mesi_copertura: round1(importoFondo / speseEssenzialiMensili),
    spese_essenziali_mensili: Math.round(speseEssenzialiMensili * 100) / 100,
    importo_fondo: importoFondo,
    motivo: null,
    // true quando una parte non trascurabile delle uscite nel periodo non ha
    // una categoria classificata (id orfano o senza essenzialita valida):
    // la stima delle spese essenziali potrebbe essere sottostimata, perché
    // NON_CLASSIFICATA non entra mai in `essenziale` (vedi essenzialita.service.js).
    classificazione_incompleta: classificazioneIncompleta,
  };
}

module.exports = { calcolaMesiCopertura };
