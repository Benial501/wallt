const { Op } = require('sequelize');
const { BankConnection } = require('../../models');
const logger = require('../../utils/logger');
const {
  STATI_SINCRONIZZABILI, SYNC_LOCK_SCADENZA_MINUTI, ERRORI_RICHIEDONO_RICONNESSIONE,
} = require('../../constants/bankSync');
const {
  BANK_SYNC_ENABLED, BANK_SYNC_CRON_ENABLED, BANK_SYNC_CRON_ORE_MINIME,
  BANK_SYNC_CRON_MAX_PER_ESECUZIONE,
} = require('../../constants/appConfig');
const { getConfigs } = require('../appConfig.service');
const { canUseFeature, FEATURE_BANK_SYNC } = require('../entitlements.service');
const { sincronizza } = require('./syncEngine.service');

/**
 * Sincronizzazione pianificata: un worker a lotti, non un job per utente.
 *
 * ── Perché un lotto e non "tutti" ────────────────────────────────────────
 * Il provider applica un rate limit per account e una quota complessiva, e
 * ogni chiamata ha un costo. Lanciare una sincronizzazione per ogni utente a
 * ogni passaggio esaurirebbe la quota e, su Vercel, sfonderebbe il tempo
 * massimo della funzione. Il worker seleziona le connessioni che hanno
 * davvero bisogno di un aggiornamento, in numero limitato, e le processa in
 * serie.
 *
 * ── Selezione: chi ne ha bisogno ─────────────────────────────────────────
 *  • stato sincronizzabile (`attiva` o `errore`);
 *  • nessuna sincronizzazione in corso (il lock è libero o scaduto);
 *  • ultima sincronizzazione riuscita più vecchia di `ore_minime`, oppure
 *    mai avvenuta;
 *  • NON in attesa di riconnessione: un consenso scaduto non si ripara
 *    riprovando, serve un'azione dell'utente. Insistere brucerebbe quota per
 *    ottenere lo stesso errore.
 * Le più vecchie per prime: nessuna connessione resta indietro perché il
 * lotto è pieno.
 *
 * ── Backoff ──────────────────────────────────────────────────────────────
 * Non c'è un ciclo di retry dentro un'esecuzione. Il ritardo è il lotto
 * successivo, e la crescita è data da `ore_minime` più il contatore di
 * errori: una connessione che fallisce da molto tempo viene riprovata meno
 * spesso. Nessun ciclo infinito, nessun tentativo immediato ripetuto.
 *
 * ── L'entitlement viene riverificato ─────────────────────────────────────
 * Il cron non si fida dello stato della connessione: chiama `canUseFeature`
 * per ogni utente. Una revoca avvenuta fra l'ultimo passaggio e questo deve
 * fermare la sincronizzazione anche se la sospensione della connessione non
 * fosse andata a buon fine.
 */

/** Il ritardo aggiuntivo in ore dovuto ai fallimenti consecutivi. Cresce con
 * gli errori, si ferma a 48 ore: oltre non ha senso insistere, e la
 * connessione va comunque mostrata in errore all'utente. */
const backoffOre = (erroriTotali, successiTotali) => {
  // Solo i fallimenti successivi all'ultimo successo contano come streak: in
  // mancanza di quel dato si usa una stima prudente dal rapporto.
  const consecutivi = successiTotali === 0 ? erroriTotali : Math.max(erroriTotali - successiTotali, 0);
  if (consecutivi <= 0) return 0;
  return Math.min(2 ** Math.min(consecutivi, 5), 48);
};

/**
 * Le connessioni candidate a una sincronizzazione pianificata.
 */
async function selezionaDaSincronizzare({ oreMinime, massimo }) {
  const sogliaBase = new Date(Date.now() - oreMinime * 60 * 60 * 1000);
  const lockScaduto = new Date(Date.now() - SYNC_LOCK_SCADENZA_MINUTI * 60 * 1000);

  const candidate = await BankConnection.findAll({
    where: {
      status: { [Op.in]: STATI_SINCRONIZZABILI },
      [Op.and]: [
        {
          [Op.or]: [
            { sync_started_at: null },
            { sync_started_at: { [Op.lt]: lockScaduto } },
          ],
        },
        {
          [Op.or]: [
            { last_successful_sync_at: null },
            { last_successful_sync_at: { [Op.lt]: sogliaBase } },
          ],
        },
      ],
      // Un consenso scaduto o un'autorizzazione revocata non si riparano
      // riprovando: richiedono un'azione dell'utente.
      //
      // `error_code: { [Op.notIn]: [...] }` da solo sarebbe SBAGLIATO: in SQL
      // `NULL NOT IN (...)` vale NULL, non vero, quindi una connessione senza
      // errori — cioè il caso normale — verrebbe ESCLUSA e il cron non
      // sincronizzerebbe mai niente. Il NULL va dichiarato esplicitamente.
      [Op.or]: [
        { error_code: null },
        { error_code: { [Op.notIn]: ERRORI_RICHIEDONO_RICONNESSIONE } },
      ],
    },
    // Le più vecchie per prime (chi non ha mai sincronizzato è il più
    // arretrato di tutti e viene prima).
    order: [['last_successful_sync_at', 'ASC'], ['id', 'ASC']],
    // Si prende qualche candidata in più del lotto, perché il backoff ne
    // scarterà alcune.
    limit: Math.max(massimo * 3, massimo),
  });

  const adesso = Date.now();
  return candidate.filter((c) => {
    const ritardo = backoffOre(c.sync_errori_totali, c.sync_ok_totali);
    if (ritardo === 0) return true;
    const ultimoErrore = c.last_error_at ? new Date(c.last_error_at).getTime() : 0;
    return ultimoErrore + ritardo * 60 * 60 * 1000 <= adesso;
  }).slice(0, massimo);
}

/**
 * Un passaggio del worker. Non lancia mai: un singolo utente che fallisce non
 * deve fermare il lotto, e il cron deve poter essere rieseguito a qualunque
 * frequenza (la sincronizzazione è idempotente).
 */
async function processaSincronizzazioniPianificate({ provider = null } = {}) {
  const config = await getConfigs([
    BANK_SYNC_ENABLED, BANK_SYNC_CRON_ENABLED,
    BANK_SYNC_CRON_ORE_MINIME, BANK_SYNC_CRON_MAX_PER_ESECUZIONE,
  ], { fresco: true });

  if (!config[BANK_SYNC_ENABLED]) {
    return { saltato: true, motivo: 'bank_sync_disattivato', processate: 0 };
  }
  if (!config[BANK_SYNC_CRON_ENABLED]) {
    return { saltato: true, motivo: 'cron_disattivato', processate: 0 };
  }

  const candidate = await selezionaDaSincronizzare({
    oreMinime: config[BANK_SYNC_CRON_ORE_MINIME],
    massimo: config[BANK_SYNC_CRON_MAX_PER_ESECUZIONE],
  });

  const esiti = {
    processate: 0, riuscite: 0, saltate: 0, fallite: 0, senza_permesso: 0, importati: 0,
  };

  for (const connessione of candidate) {
    // Riverifica del permesso a ogni passaggio: una revoca avvenuta nel
    // frattempo deve fermare la sincronizzazione.
    const permesso = await canUseFeature(connessione.user_id, FEATURE_BANK_SYNC);
    if (!permesso.consentito) {
      esiti.senza_permesso += 1;
      continue;
    }

    esiti.processate += 1;
    try {
      const esito = await sincronizza({
        userId: connessione.user_id,
        connectionId: connessione.id,
        origine: 'cron',
        provider,
        // Il cron ha il proprio criterio di selezione (ore minime): il
        // cooldown dei click manuali non lo riguarda.
        ignoraCooldown: true,
      });
      if (esito.saltato) {
        // Non è un successo e non è un guasto: la connessione aspetta che
        // l'utente dica da quando importare (vedi `sogliaMancante` nel
        // motore). Contarla fra le riuscite racconterebbe una sync che non
        // è avvenuta.
        esiti.saltate += 1;
        continue;
      }
      esiti.riuscite += 1;
      esiti.importati += esito.importati;
    } catch (error) {
      esiti.fallite += 1;
      // Lo stato di errore è già scritto sulla connessione da `sincronizza`.
      logger.warn('Sincronizzazione pianificata fallita', {
        connessione_id: connessione.id, codice: error.codice ?? null,
      });
    }
  }

  return { saltato: false, candidate: candidate.length, ...esiti };
}

module.exports = {
  backoffOre,
  selezionaDaSincronizzare,
  processaSincronizzazioniPianificate,
};
