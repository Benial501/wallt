'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.createTable('piani_pagamento', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        conto_id: { type: S.INTEGER, allowNull: false, references: { model: 'conti', key: 'id' }, onDelete: 'RESTRICT' },
        categoria: { type: S.STRING(100), allowNull: true },
        descrizione: { type: S.STRING(500), allowNull: true },
        importo_acquisto: { type: S.DECIMAL(12, 2), allowNull: false },
        importo_iniziale: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        numero_pagamenti: { type: S.INTEGER, allowNull: false },
        tasso_annuo: { type: S.DECIMAL(8, 4), allowNull: false, defaultValue: 0 },
        totale_da_restituire: { type: S.DECIMAL(12, 2), allowNull: false },
        interessi_stimati: { type: S.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        movimento_iniziale_id: { type: S.INTEGER, allowNull: true, references: { model: 'movimenti', key: 'id' }, onDelete: 'SET NULL' },
        stato: { type: S.STRING(20), allowNull: false, defaultValue: 'attivo' },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.createTable('pagamenti_programmati', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        piano_id: { type: S.INTEGER, allowNull: true, references: { model: 'piani_pagamento', key: 'id' }, onDelete: 'CASCADE' },
        conto_id: { type: S.INTEGER, allowNull: false, references: { model: 'conti', key: 'id' }, onDelete: 'RESTRICT' },
        tipo: { type: S.STRING(20), allowNull: false },
        importo: { type: S.DECIMAL(12, 2), allowNull: false },
        categoria: { type: S.STRING(100), allowNull: true },
        descrizione: { type: S.STRING(500), allowNull: true },
        data_scadenza: { type: S.DATEONLY, allowNull: false },
        stato: { type: S.STRING(20), allowNull: false, defaultValue: 'in_attesa' },
        movimento_id: { type: S.INTEGER, allowNull: true, references: { model: 'movimenti', key: 'id' }, onDelete: 'SET NULL' },
        pagato_il: { type: S.DATEONLY, allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      for (const table of ['piani_pagamento', 'pagamenti_programmati']) {
        await q.sequelize.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, { transaction });
      }
      await q.addIndex('pagamenti_programmati', ['user_id', 'stato', 'data_scadenza'], { transaction });
      await q.addIndex('pagamenti_programmati', ['piano_id', 'data_scadenza'], { transaction });
      await q.addIndex('piani_pagamento', ['user_id', 'stato'], { transaction });
      await q.addConstraint('pagamenti_programmati', {
        fields: ['movimento_id'], type: 'unique', name: 'pagamenti_programmati_movimento_unico', transaction,
      });
      await q.sequelize.query(
        "ALTER TABLE piani_pagamento ADD CONSTRAINT piani_pagamento_importi_validi CHECK (importo_acquisto > 0 AND importo_iniziale >= 0 AND importo_iniziale <= importo_acquisto AND numero_pagamenti > 0 AND tasso_annuo >= 0 AND totale_da_restituire >= importo_acquisto AND interessi_stimati >= 0 AND stato IN ('attivo','completato','annullato'))",
        { transaction },
      );
      await q.sequelize.query(
        "ALTER TABLE pagamenti_programmati ADD CONSTRAINT pagamenti_programmati_importi_stato_validi CHECK (importo > 0 AND tipo IN ('entrata','uscita') AND stato IN ('in_attesa','pagato','annullato'))",
        { transaction },
      );
      await q.sequelize.query(`
        DO $$
        DECLARE role_name text; tabella text;
        BEGIN
          FOREACH tabella IN ARRAY ARRAY['piani_pagamento', 'pagamenti_programmati'] LOOP
            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', tabella, role_name);
              END IF;
            END LOOP;
          END LOOP;
        END $$;
      `, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.dropTable('pagamenti_programmati', { transaction });
      await q.dropTable('piani_pagamento', { transaction });
      await q.sequelize.query('DROP TYPE IF EXISTS "enum_pagamenti_programmati_tipo"', { transaction });
    });
  },
};
