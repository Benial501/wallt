const { Op, fn, col } = require('sequelize');
const logger = require('../utils/logger');
const {
  User, UserEntitlement, BankConnection,
} = require('../models');
const {
  FEATURE_BANK_SYNC, ENTITLEMENT_ATTIVO, SOURCE_ADMIN,
} = require('../constants/entitlements');
const { STATO_ERRORE, STATO_ATTIVA, STATI_VIVI } = require('../constants/bankSync');
const {
  grantEntitlement, revokeEntitlement, descriviPiano, descriviPianiBatch, canUseFeature,
} = require('../services/entitlements.service');
const { statoSlot } = require('../services/betaSlots.service');
const connessioni = require('../services/bankSync/connections.service');
const appConfig = require('../services/appConfig.service');
const { registraAudit, ultimiEventi, EVENTI } = require('../services/auditLog.service');
const richiestePremium = require('../services/premiumRequests.service');

/**
 * Area di amministrazione.
 *
 * ── Chi può entrare ──────────────────────────────────────────────────────
 * `requireAdmin` (nella route) legge il ruolo dal database a ogni richiesta.
 * Non dal JWT — revocare un amministratore avrebbe effetto solo alla
 * scadenza del token — e non da un confronto di email, che lega il
 * privilegio a un dato modificabile dall'utente stesso.
 *
 * ── Ogni azione è auditata ───────────────────────────────────────────────
 * Concedere o revocare un diritto, scollegare la banca di qualcuno, cambiare
 * un feature flag: tutto finisce in `audit_logs` con `actor_user_id` = chi ha
 * agito e `user_id` = il soggetto. Senza quella distinzione l'audit non
 * risponde alla domanda per cui esiste.
 *
 * ── Cosa l'amministratore NON vede ───────────────────────────────────────
 * Nessun movimento, nessun saldo, nessuna descrizione di transazione,
 * nessun IBAN (nemmeno mascherato), nessun identificatore del provider.
 * Vede chi ha accesso, da dove viene quell'accesso e se la connessione
 * funziona: quanto basta per amministrare la beta e diagnosticare un
 * problema. I dati finanziari di una persona non sono dati di amministrazione.
 */

/** `GET /api/admin/riepilogo` */
const getRiepilogo = async (req, res) => {
  try {
    const [
      utentiTotali, slot, bankSyncAttivi, perStato, connessioniInErrore, ultimiSync,
    ] = await Promise.all([
      User.count(),
      statoSlot(FEATURE_BANK_SYNC),
      UserEntitlement.count({
        where: { feature_key: FEATURE_BANK_SYNC, status: ENTITLEMENT_ATTIVO },
      }),
      UserEntitlement.findAll({
        where: { feature_key: FEATURE_BANK_SYNC, status: ENTITLEMENT_ATTIVO },
        attributes: ['source', [fn('count', col('id')), 'quante']],
        group: ['source'],
        raw: true,
      }),
      BankConnection.count({ where: { status: STATO_ERRORE } }),
      BankConnection.findAll({
        where: { status: { [Op.in]: STATI_VIVI } },
        attributes: [
          'id', 'user_id', 'status', 'institution_id', 'institution_name',
          'last_sync_at', 'last_successful_sync_at', 'error_code',
          'sync_ok_totali', 'sync_errori_totali', 'movimenti_importati_totali',
          'duplicati_evitati_totali',
        ],
        order: [['last_sync_at', 'DESC']],
        limit: 20,
      }),
    ]);

    const [connessioniAttive, contatoriRichieste] = await Promise.all([
      BankConnection.count({ where: { status: STATO_ATTIVA } }),
      richiestePremium.contatori(),
    ]);

    res.json({
      utenti_totali: utentiTotali,
      // Quante persone hanno chiesto Premium, per stato. È la domanda a cui
      // il solo elenco degli utenti non sa rispondere: lì si vede chi HA
      // l'accesso, non chi lo vuole.
      richieste_premium: contatoriRichieste,
      beta: {
        occupati: slot.occupati,
        limite: slot.limite,
        disponibili: slot.disponibili,
        attiva: slot.beta_attiva,
      },
      // Free = chi non ha nessun entitlement attivo su Bank Sync. Esposto
      // dal server e non calcolato nella UI: una sottrazione fatta a schermo
      // diventerebbe sbagliata il giorno in cui esisterà una seconda feature.
      utenti_free: Math.max(utentiTotali - bankSyncAttivi, 0),
      bank_sync: {
        entitlement_attivi: bankSyncAttivi,
        per_origine: perStato.reduce((acc, r) => ({ ...acc, [r.source]: Number(r.quante) }), {}),
        connessioni_attive: connessioniAttive,
        connessioni_in_errore: connessioniInErrore,
      },
      // Metriche di osservabilità aggregate: nessun importo, nessun saldo.
      ultimi_sync: ultimiSync.map((c) => ({
        connessione_id: c.id,
        user_id: c.user_id,
        stato: c.status,
        istituto: c.institution_name || c.institution_id,
        ultimo_tentativo: c.last_sync_at,
        ultima_riuscita: c.last_successful_sync_at,
        codice_errore: c.error_code,
        sync_riuscite: c.sync_ok_totali,
        sync_fallite: c.sync_errori_totali,
        movimenti_importati: c.movimenti_importati_totali,
        duplicati_evitati: c.duplicati_evitati_totali,
      })),
    });
  } catch (error) {
    logger.error('Errore admin getRiepilogo', { err: error });
    res.status(500).json({ message: 'Errore nel recupero del riepilogo' });
  }
};

/** `GET /api/admin/utenti` */
const getUtenti = async (req, res) => {
  try {
    const { q = null, limite = 50, solo_bank_sync: soloBankSync = false } = req.query;

    const where = {};
    if (q) {
      where[Op.or] = [
        { email: { [Op.iLike]: `%${q}%` } },
        { nome: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const utenti = await User.findAll({
      where,
      attributes: ['id', 'nome', 'email', 'ruolo', 'created_at', 'last_login_at'],
      include: [
        {
          model: UserEntitlement,
          as: 'entitlements',
          required: !!soloBankSync,
          where: soloBankSync
            ? { feature_key: FEATURE_BANK_SYNC, status: ENTITLEMENT_ATTIVO }
            : undefined,
          attributes: ['feature_key', 'status', 'source', 'granted_at', 'expires_at'],
        },
        {
          model: BankConnection,
          as: 'bankConnections',
          required: false,
          where: { status: { [Op.in]: STATI_VIVI } },
          attributes: [
            'id', 'status', 'institution_id', 'institution_name',
            'last_successful_sync_at', 'error_code',
          ],
        },
      ],
      order: [['id', 'DESC']],
      limit: Math.min(Number(limite) || 50, 200),
    });

    // Il piano di tutti in due query, non due per riga: la lista
    // amministrativa è l'unico punto che ne chiede molti insieme.
    const piani = await descriviPianiBatch(utenti.map((u) => u.id));

    res.json({
      utenti: utenti.map((u) => {
        const piano = piani.get(u.id) ?? { piano: 'free', piano_etichetta: 'WALLT Free' };
        const bankSync = u.entitlements?.find((e) => e.feature_key === FEATURE_BANK_SYNC) ?? null;
        const connessione = u.bankConnections?.[0] ?? null;
        return {
          id: u.id,
          nome: u.nome,
          email: u.email,
          ruolo: u.ruolo,
          registrato_il: u.created_at,
          ultimo_accesso: u.last_login_at,
          piano: piano.piano,
          piano_etichetta: piano.piano_etichetta,
          bank_sync: bankSync ? {
            stato: bankSync.status,
            source: bankSync.source,
            concesso_il: bankSync.granted_at,
            scade_il: bankSync.expires_at,
          } : null,
          banca: connessione ? {
            stato: connessione.status,
            istituto: connessione.institution_name || connessione.institution_id,
            ultima_sincronizzazione: connessione.last_successful_sync_at,
            codice_errore: connessione.error_code,
          } : null,
        };
      }),
    });
  } catch (error) {
    logger.error('Errore admin getUtenti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero degli utenti' });
  }
};

/**
 * `POST /api/admin/entitlements/grant`
 *
 * L'origine è `admin`, cablata: un amministratore non può assegnare un posto
 * `beta_25` da qui, perché quello è a numero chiuso e passa solo dal lock di
 * `betaSlots`. Conseguenza voluta: una concessione amministrativa NON
 * consuma la quota dei 25, e può avvenire anche dopo che è esaurita.
 */
const grant = async (req, res) => {
  try {
    const { user_id: userId, feature_key: featureKey, nota = null, expires_at: expiresAt = null } = req.body;

    const destinatario = await User.findByPk(userId, { attributes: ['id'] });
    if (!destinatario) return res.status(404).json({ message: 'Utente non trovato' });

    const esito = await grantEntitlement({
      userId,
      featureKey,
      source: SOURCE_ADMIN,
      actorUserId: req.userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      nota,
    });

    // Se l'utente aveva una connessione sospesa per mancanza di permesso,
    // torna utilizzabile: altrimenti riceverebbe il diritto e resterebbe
    // bloccato, senza capire perché.
    if (featureKey === FEATURE_BANK_SYNC) {
      await connessioni.riattivaDopoEntitlement({ userId });
    }

    await registraAudit({
      userId,
      actorUserId: req.userId,
      evento: EVENTI.ADMIN_CONCESSIONE,
      entita: 'entitlement',
      entitaId: esito.entitlement.id,
      metadata: {
        feature_key: featureKey,
        source: SOURCE_ADMIN,
        gia_attivo: esito.giaAttivo,
        con_scadenza: !!expiresAt,
      },
    });

    return res.json({
      concesso: !esito.giaAttivo,
      gia_attivo: esito.giaAttivo,
      entitlement: {
        feature_key: esito.entitlement.feature_key,
        status: esito.entitlement.status,
        source: esito.entitlement.source,
        granted_at: esito.entitlement.granted_at,
        expires_at: esito.entitlement.expires_at,
      },
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin grant', { err: error });
    return res.status(500).json({ message: 'Errore nella concessione' });
  }
};

/**
 * `POST /api/admin/entitlements/revoke`
 *
 * Revoca il diritto e sospende la connessione bancaria, ma NON cancella
 * nessun movimento già importato: l'utente perde la sincronizzazione, non i
 * suoi dati.
 */
const revoke = async (req, res) => {
  try {
    const { user_id: userId, feature_key: featureKey, nota = null } = req.body;

    const esito = await revokeEntitlement({
      userId, featureKey, actorUserId: req.userId, nota,
    });

    let sospese = 0;
    if (featureKey === FEATURE_BANK_SYNC) {
      ({ sospese } = await connessioni.sospendiPerEntitlement({
        userId, actorUserId: req.userId,
      }));
    }

    await registraAudit({
      userId,
      actorUserId: req.userId,
      evento: EVENTI.ADMIN_REVOCA,
      entita: 'entitlement',
      entitaId: esito.entitlement?.id ?? null,
      metadata: { feature_key: featureKey, era_attivo: esito.eraAttivo, connessioni_sospese: sospese },
    });

    return res.json({
      revocato: esito.eraAttivo,
      connessioni_sospese: sospese,
      movimenti_conservati: true,
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin revoke', { err: error });
    return res.status(500).json({ message: 'Errore nella revoca' });
  }
};

/** `GET /api/admin/utenti/:id/bank-sync` — lo stato di un utente, per diagnosi. */
const getStatoUtente = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const utente = await User.findByPk(userId, { attributes: ['id', 'nome', 'email'] });
    if (!utente) return res.status(404).json({ message: 'Utente non trovato' });

    const [piano, permesso, stato] = await Promise.all([
      descriviPiano(userId),
      canUseFeature(userId, FEATURE_BANK_SYNC),
      connessioni.statoConnessione(userId),
    ]);

    return res.json({
      utente: { id: utente.id, nome: utente.nome, email: utente.email },
      piano: piano.piano,
      entitlements: piano.entitlements,
      permesso_bank_sync: { attiva: permesso.consentito, motivo: permesso.motivo, source: permesso.source },
      // La connessione serializzata non contiene identificatori del provider;
      // l'IBAN mascherato invece sì, quindi viene rimosso qui: a un
      // amministratore non serve riconoscere il conto di qualcun altro.
      connessione: stato.connessione
        ? { ...stato.connessione, iban_mascherato: null }
        : null,
    });
  } catch (error) {
    logger.error('Errore admin getStatoUtente', { err: error });
    return res.status(500).json({ message: 'Errore nel recupero dello stato' });
  }
};

/** `POST /api/admin/utenti/:id/scollega-banca` */
const scollegaBancaUtente = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const esito = await connessioni.scollega({ userId });

    await registraAudit({
      userId,
      actorUserId: req.userId,
      evento: EVENTI.CONNESSIONE_REVOCATA,
      entita: 'bank_connection',
      metadata: { da_amministratore: true },
    });

    return res.json({ ...esito, movimenti_conservati: true });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin scollegaBancaUtente', { err: error });
    return res.status(500).json({ message: 'Errore nello scollegamento' });
  }
};

/** `GET /api/admin/config` */
const getConfigurazione = async (_req, res) => {
  try {
    res.json({ configurazione: await appConfig.descriviConfigurazione() });
  } catch (error) {
    logger.error('Errore admin getConfigurazione', { err: error });
    res.status(500).json({ message: 'Errore nel recupero della configurazione' });
  }
};

/** `PUT /api/admin/config` — l'interruttore d'emergenza. */
const setConfigurazione = async (req, res) => {
  try {
    const { chiave, valore } = req.body;
    const nuovo = await appConfig.setConfig(chiave, valore, { actorUserId: req.userId });

    await registraAudit({
      actorUserId: req.userId,
      evento: EVENTI.CONFIG_MODIFICATA,
      entita: 'config',
      entitaId: chiave,
      metadata: { chiave, valore: nuovo },
    });

    return res.json({ chiave, valore: nuovo });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin setConfigurazione', { err: error });
    return res.status(500).json({ message: 'Errore nel salvataggio della configurazione' });
  }
};

/** `GET /api/admin/audit` */
const getAudit = async (req, res) => {
  try {
    const eventi = await ultimiEventi({
      limite: req.query.limite,
      userId: req.query.user_id ? Number(req.query.user_id) : null,
      evento: req.query.evento || null,
    });
    res.json({
      eventi: eventi.map((e) => ({
        id: e.id,
        quando: e.created_at,
        evento: e.evento,
        esito: e.esito,
        user_id: e.user_id,
        actor_user_id: e.actor_user_id,
        entita: e.entita,
        entita_id: e.entita_id,
        metadata: e.metadata,
      })),
    });
  } catch (error) {
    logger.error('Errore admin getAudit', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dell\'audit' });
  }
};

/**
 * `GET /api/admin/richieste-premium`
 *
 * L'elenco di chi ha chiesto Premium, con i contatori per stato. È la
 * sezione che distingue "tutti gli utenti" da "chi ha davvero manifestato
 * interesse": senza, l'unico modo di saperlo sarebbe guardare chi ha già
 * l'accesso, che è l'informazione opposta.
 */
const getRichiestePremium = async (req, res) => {
  try {
    const [elenco, contatori] = await Promise.all([
      richiestePremium.elenco({ stato: req.query.stato || null, limite: req.query.limite }),
      richiestePremium.contatori(),
    ]);
    return res.json({ richieste: elenco, contatori });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin getRichiestePremium', { err: error });
    return res.status(500).json({ message: 'Errore nel recupero delle richieste' });
  }
};

/**
 * `POST /api/admin/richieste-premium/:id/approva`
 *
 * Approvare concede l'entitlement con `source: 'admin'`, che per
 * costruzione NON consuma uno dei 25 posti beta (`grantEntitlement` rifiuta
 * `beta_25`). L'audit lo registra con soggetto e attore distinti.
 */
const approvaRichiesta = async (req, res) => {
  try {
    const esito = await richiestePremium.approva({
      id: Number(req.params.id),
      actorUserId: req.userId,
      motivo: req.body?.motivo ?? null,
    });

    // Se l'utente aveva una connessione sospesa per mancanza di permesso,
    // torna utilizzabile: altrimenti riceverebbe il diritto e resterebbe
    // bloccato senza capire perché. Stessa cura di `grant`.
    if (esito.richiesta.requested_feature === FEATURE_BANK_SYNC) {
      await connessioni.riattivaDopoEntitlement({ userId: esito.entitlement.user_id });
    }

    return res.json({
      approvata: true,
      richiesta: esito.richiesta,
      entitlement_gia_attivo: esito.giaAttivo,
      // Dichiarato nella risposta perché è la proprietà che il brief chiede
      // di preservare, e un test la verifica: una concessione manuale non
      // toglie un posto a chi potrebbe ancora entrare gratis.
      posto_beta_consumato: false,
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin approvaRichiesta', { err: error });
    return res.status(500).json({ message: 'Errore nell\'approvazione' });
  }
};

/**
 * `POST /api/admin/richieste-premium/:id/rifiuta`
 *
 * Rifiutare NON è revocare (brief, punto 10): la richiesta cambia stato e
 * resta come storico, ma nessun entitlement viene toccato. Un utente che
 * ha Bank Sync per un posto beta e si vede rifiutare una richiesta continua
 * ad avere Bank Sync — toglierglielo qui sarebbe un effetto collaterale che
 * nessuno ha chiesto, e renderebbe le due operazioni indistinguibili
 * nell'audit.
 */
const rifiutaRichiesta = async (req, res) => {
  try {
    const esito = await richiestePremium.rifiuta({
      id: Number(req.params.id),
      actorUserId: req.userId,
      motivo: req.body?.motivo ?? null,
    });
    return res.json({
      rifiutata: true,
      richiesta: esito.richiesta,
      entitlement_invariati: true,
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error?.statusCode < 500) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error('Errore admin rifiutaRichiesta', { err: error });
    return res.status(500).json({ message: 'Errore nel rifiuto' });
  }
};

module.exports = {
  getRiepilogo,
  getRichiestePremium,
  approvaRichiesta,
  rifiutaRichiesta,
  getUtenti,
  grant,
  revoke,
  getStatoUtente,
  scollegaBancaUtente,
  getConfigurazione,
  setConfigurazione,
  getAudit,
};
