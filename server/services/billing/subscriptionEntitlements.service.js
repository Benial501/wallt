const { sequelize } = require('../../models');
const {
  FEATURE_PER_PIANO,
  SOURCE_PREMIUM_SUBSCRIPTION,
  PIANO_FREE,
} = require('../../constants/entitlements');
const {
  subscriptionConDiritti, grantEntitlement, revokeEntitlement, trovaEntitlement,
  listEntitlements,
} = require('../entitlements.service');
const { registraAudit, EVENTI } = require('../auditLog.service');

/**
 * Il ponte fra abbonamento e permessi: l'unico punto in cui una subscription
 * si traduce in entitlement.
 *
 * Oggi non viene chiamato da nessun percorso di produzione, perché non
 * esistono abbonamenti. Esiste completo e testabile perché il giorno in cui
 * arriva un webhook di pagamento verificato l'integrazione sia "scrivi la
 * riga in `subscriptions`, poi chiama questa funzione" — e non una riscrittura
 * della logica dei permessi, che è il punto in cui si sbaglia.
 *
 * ── Le due regole che tengono insieme le origini ─────────────────────────
 * 1. Un entitlement con un'origine DIVERSA da `premium_subscription` non
 *    viene toccato. Un beta tester che un giorno paga non perde il suo posto
 *    beta e non si vede riscrivere il `source`: quel posto è già suo e
 *    continua a contare nella quota dei 25 finché non lo si revoca
 *    deliberatamente. Lo stesso vale per una concessione amministrativa:
 *    un abbonamento scaduto non deve togliere l'accesso a chi lo ha anche
 *    per un'altra ragione.
 * 2. Si revoca solo ciò che si era concesso: la revoca colpisce
 *    esclusivamente gli entitlement con `source: 'premium_subscription'`.
 *
 * Insieme, significano che le origini sono indipendenti e che perdere
 * l'abbonamento non può mai cancellare un diritto nato altrove.
 */

/**
 * Allinea gli entitlement di un utente al suo abbonamento attuale.
 *
 * Idempotente per costruzione: può essere chiamata quante volte si vuole (lo
 * stesso webhook consegnato due volte, una riconciliazione periodica) e il
 * risultato è sempre lo stesso stato finale.
 *
 * @param {number} userId
 * @param {{ actorUserId?: number|null }} [opzioni]
 * @returns {Promise<{piano: string, concesse: string[], revocate: string[]}>}
 */
async function allineaEntitlementDaSubscription(userId, { actorUserId = null } = {}) {
  const concesse = [];
  const revocate = [];

  await sequelize.transaction(async (transaction) => {
    const subscription = await subscriptionConDiritti(userId, { transaction });
    const piano = subscription ? subscription.plan : PIANO_FREE;
    const featureDelPiano = FEATURE_PER_PIANO[piano] ?? [];

    // Concedi ciò che il piano include e che non c'è già.
    for (const featureKey of featureDelPiano) {
      const esito = await grantEntitlement({
        userId,
        featureKey,
        source: SOURCE_PREMIUM_SUBSCRIPTION,
        actorUserId,
        // L'entitlement non scade con il periodo di fatturazione: è lo stato
        // dell'abbonamento a decidere, e un rinnovo mancato arriva come
        // evento. Legarlo a `current_period_end` farebbe sparire l'accesso a
        // metà di un rinnovo in corso.
        expiresAt: null,
        nota: `Incluso nel piano ${piano}`,
        transaction,
      });
      if (esito.creato || !esito.giaAttivo) concesse.push(featureKey);
    }

    // Revoca ciò che avevamo concesso NOI e che il piano non include più.
    const attuali = await listEntitlements(userId);
    for (const e of attuali) {
      const daRevocare = e.source === SOURCE_PREMIUM_SUBSCRIPTION
        && !featureDelPiano.includes(e.feature_key);
      if (!daRevocare) continue;

      const riga = await trovaEntitlement(userId, e.feature_key, { transaction });
      if (!riga || riga.source !== SOURCE_PREMIUM_SUBSCRIPTION) continue;

      const esito = await revokeEntitlement({
        userId,
        featureKey: e.feature_key,
        actorUserId,
        nota: 'Abbonamento non più attivo',
        transaction,
      });
      if (esito.eraAttivo) revocate.push(e.feature_key);
    }
  });

  const piano = (await subscriptionConDiritti(userId))?.plan ?? PIANO_FREE;

  for (const featureKey of concesse) {
    await registraAudit({
      userId,
      actorUserId,
      evento: EVENTI.ENTITLEMENT_CONCESSO,
      entita: 'entitlement',
      metadata: { feature_key: featureKey, source: SOURCE_PREMIUM_SUBSCRIPTION, piano },
    });
  }
  for (const featureKey of revocate) {
    await registraAudit({
      userId,
      actorUserId,
      evento: EVENTI.ENTITLEMENT_REVOCATO,
      entita: 'entitlement',
      metadata: { feature_key: featureKey, source: SOURCE_PREMIUM_SUBSCRIPTION, piano },
    });
  }

  return { piano, concesse, revocate };
}

module.exports = { allineaEntitlementDaSubscription };
