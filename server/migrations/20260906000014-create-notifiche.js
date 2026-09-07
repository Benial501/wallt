'use strict';

/**
 * Sistema di notifiche WALLT.
 *
 * Tre tabelle:
 *   - notifiche             → il centro notifiche in-app (una riga per avviso)
 *   - preferenze_notifiche  → una riga per utente, creata pigramente al primo uso
 *   - push_subscriptions    → sottoscrizioni Web Push del browser (opzionali)
 *
 * Vincoli anti-spam a livello di schema:
 *   - UNIQUE (user_id, dedupe_key): rilanciare il cron non può mai duplicare
 *     una notifica già creata, nemmeno con esecuzioni concorrenti.
 *   - giorno_riferimento: giorno LOCALE dell'utente a cui la notifica è
 *     imputata. Rende il conteggio del limite giornaliero una query indicizzata
 *     invece di un calcolo di fuso orario in SQL.
 *
 * Hardening Supabase coerente con 20260830000010/12/13: RLS attiva e nessun
 * privilegio per i ruoli pubblici `anon`/`authenticated` (l'API passa sempre
 * dal ruolo applicativo).
 */
const NUOVE_TABELLE = ['notifiche', 'preferenze_notifiche', 'push_subscriptions'];

const sqlArray = (values) => values.map((value) => `'${value}'`).join(', ');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifiche', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tipo: { type: Sequelize.STRING(50), allowNull: false },
      titolo: { type: Sequelize.STRING(150), allowNull: false },
      messaggio: { type: Sequelize.STRING(500), allowNull: false },
      link: { type: Sequelize.STRING(200), allowNull: true },
      priorita: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'normale' },
      canale: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'in_app' },
      letta: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      letta_at: { type: Sequelize.DATE, allowNull: true },
      dedupe_key: { type: Sequelize.STRING(200), allowNull: false },
      // Istante di consegna: coincide con la creazione, tranne quando la
      // notifica cade nelle ore di silenzio ed è rinviata al primo orario utile.
      programmata_per: { type: Sequelize.DATE, allowNull: false },
      // Giorno locale dell'utente su cui pesa il limite giornaliero.
      giorno_riferimento: { type: Sequelize.DATEONLY, allowNull: false },
      // false = notifica di sola consultazione, non consuma il limite e non
      // genera push (caso "limite giornaliero già raggiunto").
      conta_nel_limite: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      push_inviata_at: { type: Sequelize.DATE, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('notifiche', ['user_id', 'dedupe_key'], {
      name: 'uniq_notifiche_user_dedupe',
      unique: true,
    });
    await queryInterface.addIndex('notifiche', ['user_id', 'letta', 'programmata_per'], {
      name: 'idx_notifiche_user_letta',
    });
    await queryInterface.addIndex('notifiche', ['user_id', 'giorno_riferimento'], {
      name: 'idx_notifiche_user_giorno',
    });
    // Coda push: righe ancora da spedire, indipendentemente dall'utente.
    await queryInterface.addIndex('notifiche', ['push_inviata_at', 'programmata_per'], {
      name: 'idx_notifiche_coda_push',
    });

    await queryInterface.createTable('preferenze_notifiche', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      promemoria_giornaliero_attivo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      alert_budget_attivi: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      alert_ricorrenti_attivi: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      alert_obiettivi_attivi: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      riepilogo_settimanale_attivo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // Resta false finché l'utente non concede il permesso dal browser.
      push_attive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      orario_promemoria: { type: Sequelize.STRING(5), allowNull: false, defaultValue: '20:00' },
      timezone: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'Europe/Rome' },
      quiet_hours_inizio: { type: Sequelize.STRING(5), allowNull: false, defaultValue: '22:00' },
      quiet_hours_fine: { type: Sequelize.STRING(5), allowNull: false, defaultValue: '08:00' },
      max_notifiche_giornaliere: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 },
      // Giorno (locale) che l'utente ha marcato come "già controllato".
      giornata_controllata_il: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('push_subscriptions', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // L'endpoint è l'identificatore univoco assegnato dal push service del
      // browser: è unico globalmente, non per utente.
      endpoint: { type: Sequelize.TEXT, allowNull: false },
      p256dh: { type: Sequelize.STRING(255), allowNull: false },
      auth: { type: Sequelize.STRING(255), allowNull: false },
      user_agent: { type: Sequelize.STRING(255), allowNull: true },
      attiva: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ultimo_errore: { type: Sequelize.STRING(255), allowNull: true },
      disattivata_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // TEXT non è indicizzabile con UNIQUE su lunghezze arbitrarie in tutti i
    // motori: su PostgreSQL sì, e l'endpoint reale sta ampiamente sotto il
    // limite di btree (~2700 byte).
    await queryInterface.addIndex('push_subscriptions', ['endpoint'], {
      name: 'uniq_push_subscriptions_endpoint',
      unique: true,
    });
    await queryInterface.addIndex('push_subscriptions', ['user_id', 'attiva'], {
      name: 'idx_push_subscriptions_user_attiva',
    });

    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        tbl text;
        role_name text;
      BEGIN
        FOREACH tbl IN ARRAY ARRAY[${sqlArray(NUOVE_TABELLE)}]
        LOOP
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', tbl);

          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', tbl, role_name
              );
            END IF;
          END LOOP;
        END LOOP;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('push_subscriptions');
    await queryInterface.dropTable('preferenze_notifiche');
    await queryInterface.dropTable('notifiche');
  },
};
