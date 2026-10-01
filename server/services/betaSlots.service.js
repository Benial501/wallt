const { sequelize, UserEntitlement } = require('../models');
const {
  ENTITLEMENT_ATTIVO,
  SOURCE_BETA_25,
  isFeatureKey,
} = require('../constants/entitlements');
const {
  BANK_SYNC_BETA_ENABLED, BANK_SYNC_BETA_LIMIT, BANK_SYNC_ENABLED,
} = require('../constants/appConfig');
const { getConfigs } = require('./appConfig.service');
const { canUseFeature, trovaEntitlement } = require('./entitlements.service');
const { registraAudit, EVENTI, ESITI } = require('./auditLog.service');
const { registraAutoApprovata } = require('./premiumRequests.service');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  I posti a numero chiuso della beta gratuita
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Non esiste un contatore da nessuna parte. La sorgente di verità è il
 * COUNT delle righe:
 *
 *     SELECT count(*) FROM user_entitlements
 *     WHERE feature_key = 'bank_sync' AND status = 'active' AND source = 'beta_25'
 *
 * Un contatore mantenuto a mano è un secondo stato che può divergere da
 * quello vero (una revoca che dimentica di decrementare, un rollback che non
 * lo ripristina): la quota diventerebbe una bugia difficile da scoprire. Il
 * COUNT è lento solo in teoria — l'indice `user_entitlements_quota` esiste
 * esattamente per questo, e si parla di decine di righe.
 *
 * ── Perché il COUNT da solo NON basta ────────────────────────────────────
 * Il caso critico del brief: 24 posti su 25 occupati, due utenti attivano
 * nello stesso millisecondo. Con il solo "conta e poi inserisci" a isolamento
 * READ COMMITTED entrambe le transazioni leggono 24, entrambe inseriscono, e
 * la quota diventa 26/25. Nessuna `UNIQUE` lo impedisce, perché le due righe
 * sono di utenti diversi e sono entrambe legittime una per una.
 *
 * La serializzazione arriva da un **lock consultivo di transazione**:
 *
 *     SELECT pg_advisory_xact_lock(hashtext('wallt:beta_slot:bank_sync'))
 *
 * La seconda transazione si blocca sul lock, lo ottiene solo quando la prima
 * ha fatto COMMIT, e a quel punto il suo COUNT (nuova istruzione, isolamento
 * READ COMMITTED) vede la riga appena scritta: legge 25, si ferma. Il lock è
 * `_xact_`, non di sessione: viene rilasciato dal COMMIT/ROLLBACK, quindi non
 * può restare appeso e funziona anche attraverso il transaction pooler di
 * Supabase, che tiene la connessione fissa per la durata della transazione
 * (un lock di *sessione* lì si perderebbe, ed è l'errore da non fare).
 *
 * Il lock serializza SOLO l'assegnazione dei posti: è un'operazione che
 * avviene al massimo 25 volte nella vita della beta, non un percorso caldo.
 *
 * ── Chi NON consuma un posto ─────────────────────────────────────────────
 * Una concessione amministrativa ha `source: 'admin'` e non entra nel COUNT:
 * l'amministratore può dare Bank Sync anche dopo il 25° utente senza
 * falsificare quanti posti beta sono stati davvero distribuiti. Le due cose
 * restano separate, come richiesto.
 *
 * ── Nessun posto si assegna da sé ────────────────────────────────────────
 * `claimBetaSlot` viene chiamata solo da `POST /api/bank-sync/claim-beta`,
 * cioè dopo un click esplicito dell'utente sulla schermata della beta. Aprire
 * la pagina dei conti, o guardare lo stato del piano, non consuma niente.
 */

/** Chiave del lock. Una per feature: due feature a numero chiuso non devono
 * mettersi in coda l'una sull'altra. */
const chiaveLock = (featureKey) => `wallt:beta_slot:${featureKey}`;

const ESITI_CLAIM = Object.freeze({
  ASSEGNATO: 'assegnato',
  GIA_ATTIVO: 'gia_attivo',
  BETA_CHIUSA: 'beta_chiusa',
  POSTI_ESAURITI: 'posti_esauriti',
  FEATURE_DISATTIVATA: 'feature_disattivata',
});

/** Quanti posti beta sono occupati adesso. Dentro una transazione quando
 * serve che il conteggio sia coerente con il lock. */
const contaOccupati = (featureKey, { transaction = null } = {}) => UserEntitlement.count({
  where: { feature_key: featureKey, status: ENTITLEMENT_ATTIVO, source: SOURCE_BETA_25 },
  transaction,
});

/**
 * Lo stato dei posti, per l'interfaccia e per la pagina di amministrazione.
 *
 * `disponibili` non è una promessa: fra questa lettura e il click dell'utente
 * un altro può prendere l'ultimo posto. È `claimBetaSlot` a decidere, e il
 * client deve saper gestire un `posti_esauriti` in risposta a un claim che
 * sembrava possibile. Il frontend non è affidabile e qui non decide niente.
 */
async function statoSlot(featureKey = 'bank_sync') {
  const config = await getConfigs([
    BANK_SYNC_ENABLED, BANK_SYNC_BETA_ENABLED, BANK_SYNC_BETA_LIMIT,
  ]);
  const limite = config[BANK_SYNC_BETA_LIMIT];
  const occupati = await contaOccupati(featureKey);

  return {
    beta_attiva: !!config[BANK_SYNC_BETA_ENABLED] && !!config[BANK_SYNC_ENABLED],
    feature_attiva: !!config[BANK_SYNC_ENABLED],
    limite,
    occupati,
    disponibili: Math.max(limite - occupati, 0),
  };
}

/**
 * Rivendica uno dei posti della beta, atomicamente.
 *
 * @param {number} userId
 * @param {{ featureKey?: string }} [opzioni]
 * @returns {Promise<{esito: string, slot: object, entitlement: object|null}>}
 */
async function claimBetaSlot(userId, { featureKey = 'bank_sync' } = {}) {
  if (!isFeatureKey(featureKey)) {
    throw Object.assign(new Error('Feature non valida'), { statusCode: 400 });
  }

  const config = await getConfigs([
    BANK_SYNC_ENABLED, BANK_SYNC_BETA_ENABLED, BANK_SYNC_BETA_LIMIT,
  ], { fresco: true });

  // L'interruttore globale viene prima di tutto: se la feature è spenta non
  // si distribuiscono diritti che nessuno potrebbe usare.
  if (!config[BANK_SYNC_ENABLED]) {
    await registraAudit({
      userId,
      evento: EVENTI.BETA_RIFIUTATA,
      entita: 'entitlement',
      esito: ESITI.RIFIUTATO,
      metadata: { feature_key: featureKey, motivo: ESITI_CLAIM.FEATURE_DISATTIVATA },
    });
    return { esito: ESITI_CLAIM.FEATURE_DISATTIVATA, slot: await statoSlot(featureKey), entitlement: null };
  }

  // Già autorizzato (per qualunque origine): niente da fare e nessun posto
  // consumato. È ciò che rende sicuro un doppio click sul pulsante.
  const accessoAttuale = await canUseFeature(userId, featureKey);
  if (accessoAttuale.consentito) {
    const esistente = await trovaEntitlement(userId, featureKey);
    return { esito: ESITI_CLAIM.GIA_ATTIVO, slot: await statoSlot(featureKey), entitlement: esistente };
  }

  if (!config[BANK_SYNC_BETA_ENABLED]) {
    await registraAudit({
      userId,
      evento: EVENTI.BETA_RIFIUTATA,
      entita: 'entitlement',
      esito: ESITI.RIFIUTATO,
      metadata: { feature_key: featureKey, motivo: ESITI_CLAIM.BETA_CHIUSA },
    });
    return { esito: ESITI_CLAIM.BETA_CHIUSA, slot: await statoSlot(featureKey), entitlement: null };
  }

  const limite = config[BANK_SYNC_BETA_LIMIT];

  const risultato = await sequelize.transaction(async (transaction) => {
    // ─── La serializzazione ───────────────────────────────────────────────
    // Da qui al COMMIT nessun'altra transazione può assegnare un posto per
    // questa feature. Tutto ciò che sta sotto — conteggio e inserimento — è
    // quindi un'unica operazione indivisibile rispetto alla quota.
    await sequelize.query(
      'SELECT pg_advisory_xact_lock(hashtext(:chiave)::bigint)',
      { replacements: { chiave: chiaveLock(featureKey) }, transaction },
    );

    // Riletto DENTRO il lock: fra il controllo di cortesia qui sopra e questo
    // punto l'utente potrebbe aver ottenuto l'entitlement da un'altra
    // richiesta sua (doppio click, due schede aperte).
    const esistente = await trovaEntitlement(userId, featureKey, { transaction, lock: true });
    if (esistente && esistente.status === ENTITLEMENT_ATTIVO) {
      return { esito: ESITI_CLAIM.GIA_ATTIVO, entitlement: esistente };
    }

    const occupati = await contaOccupati(featureKey, { transaction });
    if (occupati >= limite) {
      return { esito: ESITI_CLAIM.POSTI_ESAURITI, entitlement: null };
    }

    // `source` è cablato qui: non arriva né dal client né dal chiamante. È
    // l'unico punto del codice che può scrivere `beta_25`.
    if (esistente) {
      await esistente.update({
        status: ENTITLEMENT_ATTIVO,
        source: SOURCE_BETA_25,
        granted_at: new Date(),
        expires_at: null,
        revoked_at: null,
        actor_user_id: null,
        nota: 'Posto beta gratuito',
      }, { transaction });
      return { esito: ESITI_CLAIM.ASSEGNATO, entitlement: esistente };
    }

    const entitlement = await UserEntitlement.create({
      user_id: userId,
      feature_key: featureKey,
      status: ENTITLEMENT_ATTIVO,
      source: SOURCE_BETA_25,
      granted_at: new Date(),
      expires_at: null,
      actor_user_id: null,
      nota: 'Posto beta gratuito',
    }, { transaction });

    return { esito: ESITI_CLAIM.ASSEGNATO, entitlement };
  });

  if (risultato.esito === ESITI_CLAIM.ASSEGNATO) {
    await registraAudit({
      userId,
      evento: EVENTI.BETA_RIVENDICATA,
      entita: 'entitlement',
      entitaId: risultato.entitlement.id,
      metadata: { feature_key: featureKey, source: SOURCE_BETA_25 },
    });
    // Chi attiva la beta ha manifestato interesse per Premium: lo si
    // registra come richiesta `auto_approved_beta`, così il pannello
    // amministrativo distingue "si è attivato da solo quando c'era posto"
    // da "sta aspettando una decisione". Sta FUORI dalla transazione e non
    // può lanciare: il posto è già stato assegnato, e non riuscire a
    // scrivere una riga di registro non deve trasformare un'attivazione
    // riuscita nell'errore che l'utente vede.
    await registraAutoApprovata({ userId, feature: featureKey });
  } else if (risultato.esito === ESITI_CLAIM.POSTI_ESAURITI) {
    await registraAudit({
      userId,
      evento: EVENTI.BETA_RIFIUTATA,
      entita: 'entitlement',
      esito: ESITI.RIFIUTATO,
      metadata: { feature_key: featureKey, motivo: ESITI_CLAIM.POSTI_ESAURITI, limite },
    });
  }

  return { ...risultato, slot: await statoSlot(featureKey) };
}

module.exports = {
  ESITI_CLAIM,
  statoSlot,
  contaOccupati,
  claimBetaSlot,
  chiaveLock,
};
