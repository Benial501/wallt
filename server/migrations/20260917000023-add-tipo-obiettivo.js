'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('obiettivi');
    if (columns.tipo_obiettivo) return;
    await q.sequelize.transaction(async transaction => {
      await q.addColumn('obiettivi', 'tipo_obiettivo', {
        type: S.STRING(30), allowNull: false, defaultValue: 'generico',
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE obiettivi ADD CONSTRAINT obiettivi_tipo_obiettivo CHECK (tipo_obiettivo IN ('generico','fondo_sicurezza'))",
        { transaction },
      );
    });
  },
  async down(q) {
    const columns = await q.describeTable('obiettivi');
    if (!columns.tipo_obiettivo) return;
    await q.sequelize.query('ALTER TABLE obiettivi DROP CONSTRAINT IF EXISTS obiettivi_tipo_obiettivo');
    await q.removeColumn('obiettivi', 'tipo_obiettivo');
  },
};
