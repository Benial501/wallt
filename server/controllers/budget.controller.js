const logger = require('../utils/logger');
const { ProfiloUtente } = require('../models');
const { MODELLI_IDS } = require('../constants/budget');
const { consigliaModello, percentualiDelPiano, obiettiviInCentesimi } = require('../services/budgetModello');
// Il calcolo dello stato vive in un service condiviso: lo usano anche le
// notifiche di budget e i suggerimenti delle Analisi, e due copie della stessa
// formula finirebbero per divergere (CLAUDE.md, Regola 20).
const { calcolaStatoBudget } = require('../services/budgetStato.service');
const { oggiLocale } = require('../utils/dateRome');

const entrataDelProfilo = (profilo) => {
  const valore = profilo ? parseFloat(profilo.entrata_mensile) : NaN;
  return Number.isFinite(valore) ? valore : null;
};

const pianoDelProfilo = (profilo) => (profilo?.budget_modello
  ? {
    modello: profilo.budget_modello,
    percentuali: {
      bisogni: profilo.budget_pct_bisogni,
      desideri: profilo.budget_pct_desideri,
      futuro: profilo.budget_pct_futuro,
    },
  }
  : null);

const importiInEuro = (percentuali, entrata) => {
  const centesimi = obiettiviInCentesimi(percentuali, entrata);
  return Object.fromEntries(Object.entries(centesimi).map(([voce, c]) => [voce, c / 100]));
};

/** Piano, entrata, modello consigliato e gli importi di ogni modello: la
 * scelta del modello li mostra anche quando il piano non c'è ancora. */
const descriviPiano = (profilo) => {
  const entrata = entrataDelProfilo(profilo);
  return {
    piano: pianoDelProfilo(profilo),
    entrata,
    consigliato: consigliaModello(profilo),
    modelli: MODELLI_IDS.map((id) => {
      const percentuali = percentualiDelPiano(id);
      return {
        id,
        percentuali,
        importi: percentuali && entrata > 0 ? importiInEuro(percentuali, entrata) : null,
      };
    }),
  };
};

const getPiano = async (req, res) => {
  try {
    const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    res.json(descriviPiano(profilo));
  } catch (error) {
    logger.error('Errore getPiano budget', { err: error });
    res.status(500).json({ message: 'Errore nel recupero del piano del budget' });
  }
};

const salvaPiano = async (req, res) => {
  try {
    const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    if (!(entrataDelProfilo(profilo) > 0)) {
      return res.status(422).json({ codice: 'entrata_mancante', message: 'Indica prima la tua entrata mensile' });
    }

    // Per un modello pronto valgono le percentuali del server, qualunque
    // cosa sia stata inviata; per «personalizzato» la validazione le ha già
    // controllate.
    const percentuali = percentualiDelPiano(req.body.modello, req.body.percentuali);
    await profilo.update({
      budget_modello: req.body.modello,
      budget_pct_bisogni: percentuali.bisogni,
      budget_pct_desideri: percentuali.desideri,
      budget_pct_futuro: percentuali.futuro,
    });

    res.json(descriviPiano(profilo));
  } catch (error) {
    logger.error('Errore salvaPiano budget', { err: error });
    res.status(500).json({ message: 'Errore nel salvataggio del piano del budget' });
  }
};

const getStato = async (req, res) => {
  try {
    // Il mese civile a Roma, come nel resto dell'API: solo le notifiche usano
    // il fuso delle preferenze, e leggerle qui ne creerebbe la riga.
    const stato = await calcolaStatoBudget({ userId: req.userId, oggi: oggiLocale() });
    if (!stato) return res.status(404).json({ message: 'Nessun piano di budget' });
    res.json(stato);
  } catch (error) {
    logger.error('Errore getStato budget', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo dello stato del budget' });
  }
};

module.exports = { getPiano, salvaPiano, getStato };
