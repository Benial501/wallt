'use strict';

/**
 * WALLT Premium — le fondamenta: configurazione, entitlement, abbonamenti,
 * audit e il ruolo amministratore.
 *
 * Quattro tabelle nuove e una colonna, nessuna tabella esistente toccata:
 * gli utenti attuali non perdono conti, movimenti, categorie, ricorrenti né
 * piani. Dopo questa migrazione il sistema si comporta esattamente come
 * prima — nessun entitlement esiste, quindi nessuno ha accesso a nulla di
 * nuovo — ed è deliberato: l'accesso lo concede un'azione (claim beta o
 * concessione admin), mai una migrazione.
 *
 * `user_entitlements` è il cuore. UNIQUE(user_id, feature_key) non è un
 * dettaglio di normalizzazione: è ciò che rende l'assegnazione dei 25 posti
 * beta idempotente. Due richieste simultanee dello stesso utente non possono
 * produrre due righe, quindi non possono consumare due posti, e il servizio
 * può usare ON CONFLICT DO NOTHING invece di "controlla e poi inserisci" —
 * che non è atomico.
 *
 * `app_config` contiene SOLO le righe deliberatamente cambiate: i default
 * stanno in `constants/appConfig.js`, quindi una tabella vuota si comporta
 * come il codice e cancellare una riga ripristina il default invece di
 * produrre un `null` (vedi appConfig.service.js).
 *
 * Nessuna di queste tabelle contiene credenziali, token o segreti: gli
 * `provider_*` di `subscriptions` sono identificatori opachi del fornitore di
 * pagamento, non chiavi, e non autorizzano nulla da soli.
 *
 * Come ogni tabella WALLT su Supabase (vedi 20260830000010): RLS attiva senza
 * policy e nessun privilegio ai ruoli raggiungibili con la chiave anon, che è
 * pubblica per definizione. L'API si connette con il proprietario, che non è
 * soggetto a RLS, quindi resta invariata. Per `user_entitlements` questo
 * hardening è la differenza fra "solo il server concede Bank Sync" e
 * "chiunque abbia la chiave anon se lo concede da sé".
 */

const TABELLE = ['app_config', 'user_entitlements', 'subscriptions', 'audit_logs'];

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
      // ── Ruolo amministratore ───────────────────────────────────────────
      // Determinare l'admin da un'email cablata nel frontend (o nel backend)
      // significa che chiunque possa cambiare quella email diventa admin.
      // Qui il ruolo è un dato del database, leggibile solo dal server, e
      // nessuna rotta applicativa lo scrive: si concede con
      // `server/scripts/concedi-ruolo-admin.js`.
      await q.addColumn('users', 'ruolo', {
        type: S.STRING(20),
        allowNull: false,
        defaultValue: 'utente',
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE users ADD CONSTRAINT users_ruolo CHECK (ruolo IN ('utente','admin'))",
        { transaction },
      );

      // ── app_config ─────────────────────────────────────────────────────
      await q.createTable('app_config', {
        chiave: { type: S.STRING(80), primaryKey: true },
        valore: { type: S.JSONB, allowNull: false },
        aggiornato_da: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.sequelize.query(hardenSql('app_config'), { transaction });

      // ── user_entitlements ──────────────────────────────────────────────
      await q.createTable('user_entitlements', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        feature_key: { type: S.STRING(40), allowNull: false },
        status: { type: S.STRING(20), allowNull: false, defaultValue: 'active' },
        source: { type: S.STRING(30), allowNull: false },
        granted_at: { type: S.DATE, allowNull: false },
        expires_at: { type: S.DATE, allowNull: true },
        revoked_at: { type: S.DATE, allowNull: true },
        // Chi ha concesso o revocato. Null quando l'origine non è umana
        // (beta rivendicata dall'utente stesso, webhook di billing).
        actor_user_id: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        nota: { type: S.STRING(300), allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE user_entitlements ADD CONSTRAINT user_entitlements_feature_key '
        + "CHECK (feature_key IN ('bank_sync'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE user_entitlements ADD CONSTRAINT user_entitlements_status '
        + "CHECK (status IN ('active','revoked','expired'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE user_entitlements ADD CONSTRAINT user_entitlements_source '
        + "CHECK (source IN ('beta_25','admin','premium_subscription','promotion','migration'))",
        { transaction },
      );
      // Una sola riga per (utente, feature): rende impossibile occupare due
      // posti beta con due richieste simultanee, e permette l'upsert.
      await q.addConstraint('user_entitlements', {
        fields: ['user_id', 'feature_key'],
        type: 'unique',
        name: 'user_entitlements_utente_feature',
        transaction,
      });
      // L'indice che serve al conteggio dei posti beta: il COUNT con
      // feature/status/source è la sorgente di verità della quota, e viene
      // eseguito dentro il lock di assegnazione, dove la latenza conta.
      await q.addIndex('user_entitlements', ['feature_key', 'status', 'source'], {
        name: 'user_entitlements_quota',
        transaction,
      });
      await q.sequelize.query(hardenSql('user_entitlements'), { transaction });

      // ── subscriptions ──────────────────────────────────────────────────
      // Predisposta e non usata: nessun pagamento è implementato ora, e
      // nessuna subscription finta viene creata per gli utenti beta (per
      // loro basta l'entitlement con source 'beta_25'). La tabella esiste
      // perché il giorno in cui arriva un webhook Stripe/Paddle il percorso
      // sia "scrivi la subscription → ricalcola gli entitlement", senza
      // toccare nulla di Bank Sync.
      await q.createTable('subscriptions', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        plan: { type: S.STRING(30), allowNull: false },
        status: { type: S.STRING(30), allowNull: false },
        billing_provider: { type: S.STRING(30), allowNull: true },
        provider_customer_id: { type: S.STRING(255), allowNull: true },
        provider_subscription_id: { type: S.STRING(255), allowNull: true },
        current_period_start: { type: S.DATE, allowNull: true },
        current_period_end: { type: S.DATE, allowNull: true },
        cancel_at_period_end: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan '
        + "CHECK (plan IN ('free','premium_beta','premium'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status '
        + "CHECK (status IN ('active','trialing','past_due','canceled','incomplete'))",
        { transaction },
      );
      // L'idempotenza dei webhook futuri: lo stesso evento consegnato due
      // volte aggiorna la stessa riga invece di crearne una seconda.
      await q.sequelize.query(
        'CREATE UNIQUE INDEX subscriptions_provider_subscription '
        + 'ON subscriptions (billing_provider, provider_subscription_id) '
        + 'WHERE billing_provider IS NOT NULL AND provider_subscription_id IS NOT NULL',
        { transaction },
      );
      await q.addIndex('subscriptions', ['user_id', 'status'], { transaction });
      await q.sequelize.query(hardenSql('subscriptions'), { transaction });

      // ── audit_logs ─────────────────────────────────────────────────────
      // `user_id` è il soggetto, `actor_user_id` è chi ha agito: su una
      // concessione admin sono due persone diverse, e senza la distinzione
      // l'audit non risponde alla domanda per cui esiste.
      //
      // `metadata` passa dal sanitizzatore del logger prima di arrivare qui
      // (auditLog.service.js): nessun token, nessuna password, nessun
      // importo, nessuna descrizione di transazione.
      await q.createTable('audit_logs', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        actor_user_id: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        evento: { type: S.STRING(60), allowNull: false },
        entita: { type: S.STRING(40), allowNull: true },
        entita_id: { type: S.STRING(80), allowNull: true },
        esito: { type: S.STRING(20), allowNull: false, defaultValue: 'ok' },
        metadata: { type: S.JSONB, allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_esito '
        + "CHECK (esito IN ('ok','errore','rifiutato'))",
        { transaction },
      );
      await q.addIndex('audit_logs', ['user_id', 'created_at'], { transaction });
      await q.addIndex('audit_logs', ['evento', 'created_at'], { transaction });
      await q.sequelize.query(hardenSql('audit_logs'), { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      for (const tabella of [...TABELLE].reverse()) {
        await q.dropTable(tabella, { transaction });
      }
      await q.sequelize.query(
        'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ruolo',
        { transaction },
      );
      await q.removeColumn('users', 'ruolo', { transaction });
    });
  },
};
