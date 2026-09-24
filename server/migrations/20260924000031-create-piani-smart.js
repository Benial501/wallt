'use strict';

/**
 * Piano Smart V1 — due tabelle.
 *
 * `piani_smart` è la testa del piano: input dell'utente, capitale allocabile
 * derivato, versione del motore che ha prodotto la raccomandazione e snapshot
 * degli aggregati con cui l'ha prodotta. Nessuna colonna di denaro qui muove
 * un saldo: Piano Smart V1 è solo pianificazione (nessun movimento, nessun
 * trasferimento, nessun contributo a obiettivi).
 *
 * `piani_smart_allocazioni` tiene le cinque categorie come righe e non come
 * JSON, per tre motivi concreti: la UNIQUE (plan_id, category) rende
 * "esattamente queste cinque, senza duplicati" una garanzia del database
 * invece di una convenzione applicativa; l'aggiornamento delle allocazioni
 * finali è una scrittura per categoria; `sum(final_amount)` resta
 * verificabile in SQL quando serve controllare l'invariante della somma.
 *
 * `recommended_*` e `final_*` sono separate per progetto: la raccomandazione
 * del motore va conservata anche quando l'utente la modifica, altrimenti non
 * è più possibile dire perché il piano era stato proposto così.
 *
 * `source_type` riusa il vocabolario delle nature di entrata già esistente
 * (NATURE_ENTRATA in services/entrate.service.js) meno 'sconosciuto':
 * l'origine di una somma che l'utente sta pianificando la dichiara l'utente.
 */
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('piani_smart', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        incoming_amount: { type: S.DECIMAL(12, 2), allowNull: false },
        source_type: { type: S.STRING(30), allowNull: false },
        source_recurring: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        mandatory_expenses: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        allocatable_capital: { type: S.DECIMAL(12, 2), allowNull: false },
        recommended_total: { type: S.DECIMAL(12, 2), allowNull: false },
        engine_version: { type: S.STRING(20), allowNull: false },
        context_snapshot: { type: S.JSONB, allowNull: false },
        reason_codes: { type: S.JSONB, allowNull: false },
        status: { type: S.STRING(20), allowNull: false, defaultValue: 'draft' },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE piani_smart ADD CONSTRAINT piani_smart_source_type CHECK (source_type IN '
        + "('stipendio','pensione','compenso','bonus','regalo','rimborso','vendita','altro'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE piani_smart ADD CONSTRAINT piani_smart_status CHECK (status IN '
        + "('draft','active','completed','archived'))",
        { transaction },
      );
      // Nessun importo negativo può entrare nella tabella, nemmeno per un bug
      // applicativo: il capitale allocabile è max(entrata - obbligatorie, 0).
      await q.sequelize.query(
        'ALTER TABLE piani_smart ADD CONSTRAINT piani_smart_importi_non_negativi CHECK ('
        + 'incoming_amount >= 0 AND mandatory_expenses >= 0 '
        + 'AND allocatable_capital >= 0 AND recommended_total >= 0)',
        { transaction },
      );
      await q.addIndex('piani_smart', ['user_id', 'created_at'], { transaction });
      await q.addIndex('piani_smart', ['user_id', 'status'], { transaction });

      await q.createTable('piani_smart_allocazioni', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        plan_id: {
          type: S.INTEGER,
          allowNull: false,
          references: { model: 'piani_smart', key: 'id' },
          onDelete: 'CASCADE',
        },
        category: { type: S.STRING(20), allowNull: false },
        recommended_amount: { type: S.DECIMAL(12, 2), allowNull: false },
        final_amount: { type: S.DECIMAL(12, 2), allowNull: false },
        // Nullable per progetto: a capitale allocabile zero una percentuale
        // non esiste (0/0), e scrivere 0.00 dichiarerebbe un dato che non c'è.
        recommended_percentage: { type: S.DECIMAL(5, 2), allowNull: true },
        final_percentage: { type: S.DECIMAL(5, 2), allowNull: true },
        metadata: { type: S.JSONB, allowNull: true },
        reason_codes: { type: S.JSONB, allowNull: false },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        'ALTER TABLE piani_smart_allocazioni ADD CONSTRAINT piani_smart_allocazioni_category '
        + "CHECK (category IN ('needs','safety','goals','future','freedom'))",
        { transaction },
      );
      await q.sequelize.query(
        'ALTER TABLE piani_smart_allocazioni ADD CONSTRAINT piani_smart_allocazioni_non_negative '
        + 'CHECK (recommended_amount >= 0 AND final_amount >= 0)',
        { transaction },
      );
      await q.addConstraint('piani_smart_allocazioni', {
        fields: ['plan_id', 'category'],
        type: 'unique',
        name: 'piani_smart_allocazioni_plan_category',
        transaction,
      });

      // Come per ogni altra tabella WALLT su Supabase (vedi 20260830000010,
      // 20260907000017 e 20260917000024): RLS attiva senza policy e nessun
      // privilegio ai ruoli raggiungibili con la chiave anon, che è pubblica
      // per definizione. L'API si connette con il ruolo proprietario.
      await q.sequelize.query(`
        DO $$
        DECLARE
          role_name text;
          tabella text;
        BEGIN
          FOREACH tabella IN ARRAY ARRAY['piani_smart', 'piani_smart_allocazioni']
          LOOP
            EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', tabella);
            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
            LOOP
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format(
                  'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                  'public', tabella, role_name
                );
              END IF;
            END LOOP;
          END LOOP;
        END
        $$;
      `, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async transaction => {
      await q.dropTable('piani_smart_allocazioni', { transaction });
      await q.dropTable('piani_smart', { transaction });
    });
  },
};
