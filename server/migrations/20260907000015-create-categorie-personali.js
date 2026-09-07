'use strict';
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('categorie_personali', {
        id: { type: S.STRING(50), primaryKey: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        nome: { type: S.STRING(80), allowNull: false },
        nome_normalizzato: { type: S.STRING(80), allowNull: false },
        tipo: { type: S.STRING(10), allowNull: false },
        icona: { type: S.STRING(40), allowNull: false, defaultValue: 'Tag' },
        colore: { type: S.STRING(7), allowNull: false, defaultValue: '#3498DB' },
        attiva: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.addIndex('categorie_personali', ['user_id', 'tipo', 'nome_normalizzato'], { unique: true, name: 'categorie_personali_nome_unique', transaction });
      await q.sequelize.query("ALTER TABLE categorie_personali ADD CONSTRAINT categorie_personali_tipo CHECK (tipo IN ('entrata','uscita'))", { transaction });
      await q.addColumn('movimenti', 'categoria_fonte', { type: S.STRING(40), allowNull: true }, { transaction });
    });
  },
  async down(q) {
    // Nessuna cancellazione silenziosa delle categorie ancora referenziate.
    const [rows] = await q.sequelize.query('SELECT COUNT(*) AS n FROM categorie_personali');
    if (Number(rows[0].n)) throw new Error('Esportare o riassegnare le categorie personali prima del rollback');
    await q.removeColumn('movimenti', 'categoria_fonte');
    await q.dropTable('categorie_personali');
  },
};
