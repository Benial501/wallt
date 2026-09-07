const { processaRicorrenti } = require('../services/ricorrenti.service');
const { processaNotifiche } = require('../services/notifiche/NotificheGenerator');

const processaMovimentiRicorrenti = async (_req, res, next) => {
  try {
    const result = await processaRicorrenti();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Generazione + consegna delle notifiche. È idempotente (dedupe key sul
 * database), quindi può essere richiamata a qualunque frequenza: giornaliera
 * sul piano Hobby di Vercel, oraria su Pro.
 */
const processaNotificheUtenti = async (_req, res, next) => {
  try {
    const result = await processaNotifiche();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = { processaMovimentiRicorrenti, processaNotificheUtenti };
