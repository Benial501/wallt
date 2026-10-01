'use strict';

/**
 * `premium_access_requests` — chi ha davvero chiesto Premium.
 *
 * Il pannello utenti sa chi HA l'accesso, non chi lo VUOLE: sono due
 * domande diverse, e prima di questa tabella la seconda non aveva risposta.
 * Serve a raccogliere e amministrare la domanda nel periodo che precede i
 * pagamenti, quando gli unici accessi possibili restano `beta_25` e `admin`.
 *
 * ── Una richiesta NON è un permesso ──────────────────────────────────────
 * Nessun punto del codice legge questa tabella per decidere un accesso: la
 * domanda resta `canUseFeature(userId, feature)` (Regola 23). Approvare una
 * richiesta CHIAMA `grantEntitlement(source: 'admin')`; è quella scrittura
 * ad autorizzare, non lo stato della riga. Se qualcuno cambiasse a mano uno
 * `status` in `approved` nel database, l'utente non otterrebbe nulla — ed è
 * esattamente il comportamento voluto.
 *
 * ── UNIQUE(user_id, requested_feature) ───────────────────────────────────
 * Il vincolo sta nel DATABASE e non nel servizio (Coding Rule 22):
 * "controlla e poi inserisci" non è atomico, e due POST simultanee dello
 * stesso utente passerebbero entrambe il controllo applicativo creando due
 * righe — cioè esattamente lo spam che il brief chiede di impedire. Con il
 * vincolo qui, la seconda insert fallisce e il servizio ripiega sulla riga
 * esistente.
 *
 * È volutamente una UNIQUE PIENA, non parziale su "richieste attive": una
 * sola riga per utente e feature significa che una richiesta rifiutata non
 * può essere aggirata presentandone una nuova. Lo storico della decisione
 * resta nella riga stessa (`status`, `reviewed_at`, `reviewed_by`,
 * `decision_reason`) e, per esteso, in `audit_logs` — che registra ogni
 * passaggio di stato con soggetto e attore distinti. Una riga cancellata
 * dall'utente può tornare `pending`: annullare è una sua azione, non una
 * decisione dello staff.
 *
 * ── Hardening Supabase ───────────────────────────────────────────────────
 * Come ogni tabella WALLT (vedi 20260830000010 e 20261001000041): RLS
 * attiva senza policy e nessun privilegio ai ruoli raggiungibili con la
 * chiave anon, che è pubblica per definizione. Qui conta in concreto: senza
 * hardening chiunque avesse quella chiave potrebbe inserirsi una richiesta
 * `approved` — che non concede nulla, ma inquinerebbe la coda dello staff —
 * e soprattutto LEGGERE chi ha chiesto Premium, cioè un elenco di persone.
 * L'API si connette come proprietario, che non è soggetto a RLS: nessuna
 * policy serve e il comportamento del server non cambia.
 */

const TABELLA = 'premium_access_requests';

const hardenSql = (tabella) => `
  DO $$
  DECLARE role_name text;
  BEGIN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', '${tabella}');
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
          'public', '${tabella}', role_name
        );
      END IF;
    END LOOP;
  END
  $$;
`;

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.createTable(TABELLA, {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        requested_feature: { type: S.STRING(40), allowNull: false },
        status: { type: S.STRING(30), allowNull: false, defaultValue: 'pending' },
        requested_at: { type: S.DATE, allowNull: false },
        reviewed_at: { type: S.DATE, allowNull: true },
        // Chi ha deciso. `SET NULL` e non `CASCADE`: se un amministratore
        // viene cancellato, la decisione che ha preso resta — perdere lo
        // storico insieme alla persona vanificherebbe l'audit.
        reviewed_by: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        decision_reason: { type: S.STRING(300), allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT premium_access_requests_feature `
        + "CHECK (requested_feature IN ('bank_sync'))",
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT premium_access_requests_status `
        + "CHECK (status IN ('pending','approved','rejected','cancelled','auto_approved_beta'))",
        { transaction },
      );
      // Una decisione ha sempre un momento e (quando non è automatica) un
      // autore: una riga `approved` senza `reviewed_at` renderebbe l'audit
      // incompleto proprio sui casi che contano.
      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT premium_access_requests_decisione `
        + "CHECK (status IN ('pending','cancelled') OR reviewed_at IS NOT NULL)",
        { transaction },
      );

      await q.addConstraint(TABELLA, {
        fields: ['user_id', 'requested_feature'],
        type: 'unique',
        name: 'premium_access_requests_utente_feature',
        transaction,
      });

      // L'indice della coda amministrativa: "le richieste in attesa, dalla
      // più vecchia" è la query che la pagina admin fa a ogni apertura.
      await q.addIndex(TABELLA, ['status', 'requested_at'], {
        name: 'premium_access_requests_coda',
        transaction,
      });

      await q.sequelize.query(hardenSql(TABELLA), { transaction });
    });
  },

  async down(q) {
    await q.dropTable(TABELLA);
  },
};
