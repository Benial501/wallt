'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.addColumn('movimenti', 'ricorrente_occorrenze_rimanenti', {
        type: S.INTEGER,
        allowNull: true,
      }, { transaction });
      await q.sequelize.query(
        'ALTER TABLE movimenti ADD CONSTRAINT movimenti_ricorrente_occorrenze_valide CHECK (ricorrente_occorrenze_rimanenti IS NULL OR ricorrente_occorrenze_rimanenti BETWEEN 0 AND 600)',
        { transaction },
      );
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(
        'ALTER TABLE movimenti DROP CONSTRAINT IF EXISTS movimenti_ricorrente_occorrenze_valide',
        { transaction },
      );
      await q.removeColumn('movimenti', 'ricorrente_occorrenze_rimanenti', { transaction });
    });
  },
};
