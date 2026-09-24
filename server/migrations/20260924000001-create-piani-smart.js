'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('piani_smart', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      titolo: { type: Sequelize.STRING(200), allowNull: false, defaultValue: 'Piano Smart' },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      ricorrente: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      stato: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'attivo' },
      piano: { type: Sequelize.JSONB, allowNull: false },
      archiviato_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('piani_smart', ['user_id', 'stato']);
  },
  async down(queryInterface) { await queryInterface.dropTable('piani_smart'); },
};
