'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.addColumn('pagamenti_programmati', 'ricorrenza_origine_id', {
        type: S.INTEGER,
        allowNull: true,
        references: { model: 'movimenti', key: 'id' },
        onDelete: 'CASCADE',
      }, { transaction });
      await q.addColumn('pagamenti_programmati', 'ricorrenza_periodo', {
        type: S.STRING(20),
        allowNull: true,
      }, { transaction });
      await q.sequelize.query('ALTER TABLE pagamenti_programmati DROP CONSTRAINT IF EXISTS pagamenti_programmati_importi_stato_validi', { transaction });
      await q.sequelize.query(
        "ALTER TABLE pagamenti_programmati ADD CONSTRAINT pagamenti_programmati_importi_stato_validi CHECK (importo > 0 AND stato IN ('in_attesa','in_ritardo','pagato','annullato'))",
        { transaction },
      );
      await q.sequelize.query(
        'CREATE UNIQUE INDEX pagamenti_programmati_ricorrenza_unica ON pagamenti_programmati (user_id, ricorrenza_origine_id, ricorrenza_periodo) WHERE ricorrenza_origine_id IS NOT NULL',
        { transaction },
      );
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query('DROP INDEX IF EXISTS pagamenti_programmati_ricorrenza_unica', { transaction });
      await q.sequelize.query('ALTER TABLE pagamenti_programmati DROP CONSTRAINT IF EXISTS pagamenti_programmati_importi_stato_validi', { transaction });
      await q.sequelize.query(
        "ALTER TABLE pagamenti_programmati ADD CONSTRAINT pagamenti_programmati_importi_stato_validi CHECK (importo > 0 AND stato IN ('in_attesa','pagato','annullato'))",
        { transaction },
      );
      await q.removeColumn('pagamenti_programmati', 'ricorrenza_periodo', { transaction });
      await q.removeColumn('pagamenti_programmati', 'ricorrenza_origine_id', { transaction });
    });
  },
};
