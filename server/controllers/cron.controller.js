const { processaRicorrenti } = require('../services/ricorrenti.service');
const { processaNotifiche } = require('../services/notifiche/NotificheGenerator');
const { processaSincronizzazioniPianificate } = require('../services/bankSync/cronSync.service');

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

/**
 * Sincronizzazione bancaria pianificata.
 *
 * Idempotente come il job delle notifiche (la deduplica dei movimenti e' nel
 * database), quindi puo' essere richiamata a qualunque frequenza. Non ha un
 * vincolo di ora come gli altri due: non c'e' un orario "giusto" per
 * aggiornare un saldo, e il criterio di selezione (ore minime dall'ultima
 * sincronizzazione riuscita) regola da se' la frequenza effettiva.
 *
 * Due interruttori la governano, entrambi in `app_config`:
 * `bank_sync_enabled` (globale) e `bank_sync_cron_enabled`, spento per
 * default. Si accende quando la beta e' stabile, senza un deploy.
 */
const processaSincronizzazioniBancarie = async (_req, res, next) => {
  try {
    return res.json(await processaSincronizzazioniPianificate());
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  processaMovimentiRicorrenti,
  processaNotificheUtenti,
  processaSincronizzazioniBancarie,
};
