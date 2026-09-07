module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.addColumn('categorie_regole', 'tipo', { type: S.STRING(10), allowNull: true }, { transaction });
      await q.addIndex('categorie_regole', ['user_id', 'pattern', 'tipo'], { unique: true, name: 'categorie_regole_personali_tipo_unique', where: { attiva: true }, transaction });
    });
  },
  async down(q) {
    await q.removeIndex('categorie_regole', 'categorie_regole_personali_tipo_unique');
    await q.removeColumn('categorie_regole', 'tipo');
  },
};
