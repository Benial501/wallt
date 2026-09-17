const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { list } = require('./categorie.service');
const { aggregaPerEssenzialita } = require('./essenzialita.service');

const toNumber = (val) => parseFloat(val) || 0;
const round1 = (val) => Math.round(val * 10) / 10;

/** Primo giorno del mese, N mesi indietro rispetto a `riferimento`. */
const inizioMesiFa = (riferimento, n) => {
  const d = new Date(riferimento.getFullYear(), riferimento.getMonth() - n, 1);
  return d.toISOString().split('T')[0];
};

/** Ultimo giorno del mese precedente a `riferimento` (esclude il mese corrente,
 * ancora parziale, per non far apparire le spese essenziali piu' basse di
 * quanto sono davvero). */
const fineMeseScorso = (riferimento) => {
  const d = new Date(riferimento.getFullYear(), riferimento.getMonth(), 0);
  return d.toISOString().split('T')[0];
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
  const { essenziale } = aggregaPerEssenzialita(spesoPerCategoria, categorieUscita);
  const speseEssenzialiMensili = essenziale / mesi;

  if (speseEssenzialiMensili === 0) {
    return {
      stato: 'non_calcolabile',
      mesi_copertura: null,
      spese_essenziali_mensili: 0,
      importo_fondo: importoFondo,
      motivo: 'Le spese essenziali mensili sono pari a zero: la copertura non è calcolabile.',
    };
  }

  return {
    stato: 'disponibile',
    mesi_copertura: round1(importoFondo / speseEssenzialiMensili),
    spese_essenziali_mensili: Math.round(speseEssenzialiMensili * 100) / 100,
    importo_fondo: importoFondo,
    motivo: null,
  };
}

module.exports = { calcolaMesiCopertura };
