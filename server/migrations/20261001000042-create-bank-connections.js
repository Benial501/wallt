'use strict';

/**
 * Bank Sync — la connessione bancaria e la provenienza dei movimenti.
 *
 * ── Cosa NON c'è in questa tabella, per progetto ──────────────────────────
 * Nessuna password della banca, nessun PIN, nessun CVV, nessun numero di
 * carta, nessuna credenziale di home banking, nessun access token e nessun
 * refresh token. WALLT non chiede queste informazioni e non ha un posto in
 * cui metterle: l'autorizzazione avviene sul dominio della banca, e ciò che
 * torna indietro è un identificatore opaco del consenso
 * (`provider_connection_id`) che da solo non apre niente senza le credenziali
 * applicative del provider, che vivono solo nelle variabili d'ambiente del
 * server. L'IBAN è conservato mascherato (`iban_mascherato`, ultime 4 cifre):
 * serve a far riconoscere il conto all'utente, non a disporne.
 *
 * ── Un solo conto sincronizzato per utente ────────────────────────────────
 * `UNIQUE(user_id)` sarebbe sbagliato: cancellerebbe lo storico, e una
 * connessione revocata deve restare come riga (i movimenti già importati la
 * referenziano, e l'audit deve poterla ricostruire). Il vincolo è quindi un
 * indice UNIQUE PARZIALE sui soli stati vivi: una connessione per utente fra
 * quelle non terminali, quante se ne vuole fra quelle revocate. Il limite sta
 * nel database e non solo nel servizio proprio perché "controlla e poi
 * inserisci" non è atomico: due richieste simultanee passerebbero entrambe il
 * controllo applicativo, e solo l'indice le ferma.
 *
 * ── Protezione del callback ───────────────────────────────────────────────
 * `state_hash` conserva lo SHA-256 del `state`, non il `state` (stessa scelta
 * di `password_reset_tokens`): chi leggesse la tabella non potrebbe
 * completare un'autorizzazione altrui. `state_expires_at` e `state_used_at`
 * rendono il token a scadenza e monouso, ed è `state_used_at` a dare
 * l'idempotenza: un callback consegnato due volte trova lo stato già
 * consumato e restituisce la connessione esistente invece di crearne una
 * seconda.
 *
 * ── Provenienza dei movimenti ─────────────────────────────────────────────
 * `movimenti.origine` dice da dove viene una riga. Le righe preesistenti
 * restano tutte 'manuale': non proviamo a dedurre a posteriori quali
 * arrivassero da un import di file, perché non è ricostruibile con certezza
 * (stesso principio dei test di migrazione già presenti: un movimento legacy
 * non viene classificato per inferenza). L'unica cosa che conta
 * funzionalmente è che nessuna riga preesistente risulti 'open_banking'.
 *
 * `UNIQUE(bank_connection_id, external_transaction_id)` parziale è la
 * deduplica della sincronizzazione affidata al database: il provider può
 * restituire la stessa transazione a ogni chiamata, e nemmeno due esecuzioni
 * concorrenti del motore possono inserirla due volte.
 */

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
      await q.createTable('bank_connections', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        // Il conto WALLT su cui atterrano i movimenti. Null finché il
        // consenso non è completato: il conto viene creato al callback, non
        // all'avvio dell'autorizzazione, così un'autorizzazione abbandonata
        // non lascia conti vuoti nella pagina dell'utente.
        conto_id: {
          type: S.INTEGER,
          allowNull: true,
          references: { model: 'conti', key: 'id' },
          onDelete: 'SET NULL',
        },

        provider: { type: S.STRING(30), allowNull: false },
        institution_id: { type: S.STRING(120), allowNull: false },
        institution_name: { type: S.STRING(200), allowNull: true },

        provider_connection_id: { type: S.STRING(255), allowNull: true },
        provider_account_id: { type: S.STRING(255), allowNull: true },

        status: { type: S.STRING(30), allowNull: false, defaultValue: 'in_attesa' },

        state_hash: { type: S.STRING(64), allowNull: true },
        state_expires_at: { type: S.DATE, allowNull: true },
        state_used_at: { type: S.DATE, allowNull: true },

        consent_created_at: { type: S.DATE, allowNull: true },
        consent_expires_at: { type: S.DATE, allowNull: true },

        last_sync_at: { type: S.DATE, allowNull: true },
        last_successful_sync_at: { type: S.DATE, allowNull: true },
        last_error_at: { type: S.DATE, allowNull: true },
        error_code: { type: S.STRING(40), allowNull: true },

        // Lock di sincronizzazione: una sola sync per connessione alla volta,
        // acquisito con un UPDATE condizionale (vedi syncEngine.service.js).
        // Scade da sé, così un processo morto non blocca la connessione.
        sync_started_at: { type: S.DATE, allowNull: true },

        // Dati minimi per far riconoscere il conto all'utente. Mai l'IBAN
        // completo: solo la coda, già mascherata quando viene scritta.
        iban_mascherato: { type: S.STRING(30), allowNull: true },
        valuta: { type: S.STRING(3), allowNull: true },
        saldo_provider: { type: S.DECIMAL(12, 2), allowNull: true },

        // Metriche di osservabilità, non dati finanziari: contatori che
        // l'amministratore legge per capire se la funzione sta funzionando.
        sync_ok_totali: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        sync_errori_totali: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        movimenti_importati_totali: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        duplicati_evitati_totali: { type: S.INTEGER, allowNull: false, defaultValue: 0 },

        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_provider '
        + "CHECK (provider IN ('gocardless','sandbox'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_status '
        + "CHECK (status IN ('in_attesa','attiva','consenso_scaduto','errore',"
        + "'sospesa_entitlement','revocata'))",
        { transaction },
      );
      // Il vincolo del "massimo un conto sincronizzato", nel database.
      await q.sequelize.query(
        'CREATE UNIQUE INDEX bank_connections_una_viva_per_utente '
        + 'ON bank_connections (user_id) '
        + "WHERE status <> 'revocata'",
        { transaction },
      );
      // Il callback cerca per hash dello state: l'indice è anche UNIQUE,
      // perché due connessioni non possono condividere lo stesso state.
      await q.sequelize.query(
        'CREATE UNIQUE INDEX bank_connections_state_hash '
        + 'ON bank_connections (state_hash) WHERE state_hash IS NOT NULL',
        { transaction },
      );
      await q.addIndex('bank_connections', ['user_id', 'status'], { transaction });
      // Il cron seleziona le connessioni da aggiornare: stato + ultima sync.
      await q.addIndex('bank_connections', ['status', 'last_successful_sync_at'], {
        name: 'bank_connections_da_sincronizzare',
        transaction,
      });
      await q.sequelize.query(hardenSql('bank_connections'), { transaction });

      // ── Provenienza sui movimenti ──────────────────────────────────────
      await q.addColumn('movimenti', 'origine', {
        type: S.STRING(20),
        allowNull: false,
        defaultValue: 'manuale',
      }, { transaction });
      await q.addColumn('movimenti', 'bank_connection_id', {
        type: S.INTEGER,
        allowNull: true,
        references: { model: 'bank_connections', key: 'id' },
        onDelete: 'SET NULL',
      }, { transaction });
      await q.addColumn('movimenti', 'external_transaction_id', {
        type: S.STRING(255),
        allowNull: true,
      }, { transaction });
      await q.addColumn('movimenti', 'stato_banca', {
        type: S.STRING(20),
        allowNull: true,
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE movimenti ADD CONSTRAINT movimenti_origine '
        + "CHECK (origine IN ('manuale','import','open_banking'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE movimenti ADD CONSTRAINT movimenti_stato_banca '
        + "CHECK (stato_banca IS NULL OR stato_banca IN ('booked','pending'))",
        { transaction },
      );
      // La deduplica della sincronizzazione, garantita dal database e non
      // dalla sola logica applicativa.
      await q.sequelize.query(
        'CREATE UNIQUE INDEX movimenti_open_banking_dedup '
        + 'ON movimenti (bank_connection_id, external_transaction_id) '
        + 'WHERE bank_connection_id IS NOT NULL AND external_transaction_id IS NOT NULL',
        { transaction },
      );
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query('DROP INDEX IF EXISTS movimenti_open_banking_dedup', { transaction });
      await q.sequelize.query(
        'ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_stato_banca',
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_origine',
        { transaction },
      );
      await q.removeColumn('movimenti', 'stato_banca', { transaction });
      await q.removeColumn('movimenti', 'external_transaction_id', { transaction });
      await q.removeColumn('movimenti', 'bank_connection_id', { transaction });
      await q.removeColumn('movimenti', 'origine', { transaction });
      await q.dropTable('bank_connections', { transaction });
    });
  },
};
