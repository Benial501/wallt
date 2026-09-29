/**
 * Segnalazione degli errori server a Sentry.
 *
 * Due scelte che vale la pena spiegare:
 *
 * - **Il filtro non e' nuovo.** `utils/logger.js` sa gia' cosa non puo'
 *   uscire da WALLT (chiavi finanziarie, credenziali, JWT, email) e lo applica
 *   ai log: `sanitizeMeta` e' quel punto sorgente. Scrivere qui un secondo
 *   filtro avrebbe significato due elenchi che divergono, e il giorno in cui
 *   qualcuno aggiunge un campo sensibile ne aggiornerebbe uno solo.
 *
 * - **Senza DSN non succede nulla**, come per VAPID e OpenAI: l'API si avvia
 *   identica e gli errori continuano ad andare nei log.
 */

const { logInfo, logWarn, sanitizeMeta } = require('../utils/logger');

let sentry = null;
let inizializzato = false;

const dsn = () => process.env.SENTRY_DSN?.trim();

const inizializzaMonitoraggio = () => {
  if (inizializzato) return Boolean(sentry);
  inizializzato = true;

  if (!dsn()) {
    logInfo('[monitoraggio] Sentry non configurato: SENTRY_DSN assente. Gli errori restano nei log.');
    return false;
  }

  try {
    // Richiesto qui e non in cima: senza DSN il pacchetto non viene nemmeno
    // caricato, e su una funzione serverless il tempo di avvio si paga a ogni
    // richiesta a freddo.
    // eslint-disable-next-line global-require
    sentry = require('@sentry/node');
    sentry.init({
      dsn: dsn(),
      environment: process.env.NODE_ENV || 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend: (event) => sanitizeMeta(event),
    });
    logInfo('[monitoraggio] Sentry attivo');
    return true;
  } catch (err) {
    // Il monitoraggio che non parte non puo' impedire all'API di servire.
    logWarn('[monitoraggio] Sentry non inizializzato', { err });
    sentry = null;
    return false;
  }
};

/**
 * Riporta un errore server. `contesto` viene ripulito con lo stesso filtro dei
 * log prima di partire. Non lancia mai: e' chiamata dall'error handler, che e'
 * l'ultimo posto in cui ci si puo' permettere una seconda eccezione.
 */
const segnalaErrore = (err, contesto = {}) => {
  if (!sentry) return false;
  try {
    sentry.captureException(err, { extra: sanitizeMeta(contesto) });
    return true;
  } catch {
    return false;
  }
};

const monitoraggioAttivo = () => Boolean(sentry);

module.exports = { inizializzaMonitoraggio, segnalaErrore, monitoraggioAttivo };
