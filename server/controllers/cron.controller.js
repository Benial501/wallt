const { processaRicorrenti } = require('../services/ricorrenti.service');
const { processaNotifiche } = require('../services/notifiche/NotificheGenerator');

const oraARoma = (date = new Date()) => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  hour: '2-digit',
  hourCycle: 'h23',
}).format(date));

const eCronVercel = (req) => req.get('user-agent')?.includes('vercel-cron/1.0');

// Vercel esegue i cron in UTC. I due slot configurati in vercel.json
// coprono entrambe le stagioni; solo quello che cade alle 09:00/21:00 a Roma
// esegue il job. Le invocazioni manuali restano sempre disponibili.
const processaMovimentiRicorrenti = async (req, res, next) => {
  try {
    if (eCronVercel(req) && oraARoma() !== 9) {
      return res.json({ skipped: true, reason: 'outside_rome_schedule' });
    }
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
const processaNotificheUtenti = async (req, res, next) => {
  try {
    if (eCronVercel(req) && oraARoma() !== 21) {
      return res.json({ skipped: true, reason: 'outside_rome_schedule' });
    }
    const result = await processaNotifiche();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = { processaMovimentiRicorrenti, processaNotificheUtenti };
