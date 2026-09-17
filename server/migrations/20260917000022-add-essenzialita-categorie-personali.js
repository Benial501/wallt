'use strict';
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('categorie_personali');
    if (columns.essenzialita) return;
    await q.sequelize.transaction(async transaction => {
      await q.addColumn('categorie_personali', 'essenzialita', {
        type: S.STRING(20), allowNull: true, defaultValue: 'discrezionale',
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE categorie_personali ADD CONSTRAINT categorie_personali_essenzialita CHECK (essenzialita IS NULL OR essenzialita IN ('essenziale','semi_essenziale','discrezionale'))",
        { transaction },
      );
    });
  },
  async down(q) {
    const columns = await q.describeTable('categorie_personali');
    if (!columns.essenzialita) return;
    await q.sequelize.query('ALTER TABLE categorie_personali DROP CONSTRAINT IF EXISTS categorie_personali_essenzialita');
    await q.removeColumn('categorie_personali', 'essenzialita');
  },
};
