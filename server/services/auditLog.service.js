const { AuditLog } = require('../models');
const logger = require('../utils/logger');

const { sanitizeMeta } = logger;

/**
 * Traccia degli eventi importanti su permessi e connessioni bancarie.
 *
 * Serve a due domande che senza di essa non hanno risposta: "chi ha dato
 * Bank Sync a questo utente, e quando?" e "perché questa connessione è in
 * errore da ieri?". È anche l'unico posto da cui si può ricostruire che uno
 * dei 25 posti beta è stato occupato da una persona precisa in un momento
 * preciso.
 *
 * ── Non lancia mai ───────────────────────────────────────────────────────
 * Viene chiamata dopo operazioni già riuscite (un entitlement concesso, un
 * movimento importato). Se la scrittura dell'audit fallisse e propagasse
 * l'errore, farebbe fallire un'operazione corretta e, nel peggiore dei casi,
 * rollbackerebbe una transazione valida. L'errore finisce nei log e basta —
 * stessa scelta già fatta per `valutaBudgetDopoMovimento`.
 *
 * ── Cosa NON entra qui ───────────────────────────────────────────────────
 * `metadata` passa da `sanitizeMeta`, lo stesso sanitizzatore del logger
 * (CLAUDE.md, area sensibile "Monitoraggio errori": si riusa quello esistente
 * invece di scriverne un secondo, che divergerebbe). Quindi mai token, mai
 * password, mai segreti del provider, mai importi, mai descrizioni di
 * transazione. L'audit deve dire *cosa* è successo, non *quanto* è stato
 * speso: quello sta nei movimenti, protetto dall'isolamento per utente.
 */

const EVENTI = Object.freeze({
  // Entitlement
  BETA_RIVENDICATA: 'beta_claimed',
  BETA_RIFIUTATA: 'beta_refused',
  ENTITLEMENT_CONCESSO: 'entitlement_granted',
  ENTITLEMENT_REVOCATO: 'entitlement_revoked',
  ENTITLEMENT_SCADUTO: 'entitlement_expired',
  ADMIN_CONCESSIONE: 'admin_grant',
  ADMIN_REVOCA: 'admin_revoke',

  // Richieste di accesso a Premium
  //
  // Cinque eventi distinti e non fondibili: "ha chiesto" non è "è stato
  // approvato", e soprattutto `premium_request_rejected` non è
  // `entitlement_revoked`. Rifiutare una domanda e togliere un diritto già
  // concesso sono operazioni diverse — una richiesta approvata può essere
  // seguita da una revoca — e l'audit deve permettere di ricostruire
  // entrambe le storie separatamente.
  RICHIESTA_CREATA: 'premium_request_created',
  RICHIESTA_APPROVATA: 'premium_request_approved',
  RICHIESTA_RIFIUTATA: 'premium_request_rejected',
  RICHIESTA_ANNULLATA: 'premium_request_cancelled',
  RICHIESTA_BETA_AUTO: 'premium_beta_auto_approved',

  // Connessione bancaria
  CONNESSIONE_AVVIATA: 'bank_connection_started',
  CONNESSIONE_CREATA: 'bank_connection_created',
  CONNESSIONE_SOSTITUITA: 'bank_connection_replaced',
  CONNESSIONE_REVOCATA: 'bank_connection_revoked',
  CONNESSIONE_SOSPESA: 'bank_connection_suspended',
  CALLBACK_RIFIUTATO: 'bank_callback_refused',

  // Sincronizzazione
  SYNC_AVVIATA: 'bank_sync_started',
  SYNC_COMPLETATA: 'bank_sync_completed',
  SYNC_FALLITA: 'bank_sync_failed',

  // Amministrazione
  CONFIG_MODIFICATA: 'config_changed',
});

const ESITI = Object.freeze({ OK: 'ok', ERRORE: 'errore', RIFIUTATO: 'rifiutato' });

/**
 * @param {Object} dati
 * @param {number|null} dati.userId        il soggetto dell'evento
 * @param {number|null} [dati.actorUserId] chi ha agito (un admin, o null se
 *   l'azione è dell'utente stesso o di un processo automatico)
 * @param {string} dati.evento             uno di EVENTI
 * @param {string} [dati.entita]           'entitlement' | 'bank_connection' | 'config'
 * @param {string|number} [dati.entitaId]
 * @param {string} [dati.esito]
 * @param {Object} [dati.metadata]         sanitizzato prima della scrittura
 * @param {import('sequelize').Transaction} [dati.transaction]
 */
async function registraAudit({
  userId = null,
  actorUserId = null,
  evento,
  entita = null,
  entitaId = null,
  esito = ESITI.OK,
  metadata = null,
  transaction = null,
}) {
  try {
    await AuditLog.create({
      user_id: userId,
      actor_user_id: actorUserId,
      evento,
      entita,
      entita_id: entitaId === null || entitaId === undefined ? null : String(entitaId).slice(0, 80),
      esito,
      metadata: metadata ? sanitizeMeta(metadata) : null,
    }, { transaction });
  } catch (error) {
    logger.warn('Scrittura audit log fallita', { evento, err: error });
  }
}

/**
 * Gli ultimi eventi, per la pagina di amministrazione. Non è un'API utente:
 * l'audit di un utente non gli appartiene come un movimento, e mostrarglielo
 * esporrebbe le azioni dello staff.
 */
async function ultimiEventi({ limite = 50, userId = null, evento = null } = {}) {
  const where = {};
  if (userId !== null) where.user_id = userId;
  if (evento !== null) where.evento = evento;

  return AuditLog.findAll({
    where,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(limite) || 50, 1), 200),
  });
}

module.exports = { EVENTI, ESITI, registraAudit, ultimiEventi };
