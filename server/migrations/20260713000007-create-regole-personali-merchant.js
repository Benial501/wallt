'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.createTable('regole_personali_merchant', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: false },
        pattern: { type: Sequelize.STRING(255), allowNull: false },
        merchant_name: { type: Sequelize.STRING(120), allowNull: true },
        merchant_id: { type: Sequelize.STRING(120), allowNull: true },
        categoria: { type: Sequelize.STRING(100), allowNull: true },
        priorita: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 85 },
        attiva: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    } catch (e) {
      console.log('Tabella regole_personali_merchant già esistente, skip create');
    }

    const indexes = [
      { name: 'idx_rpm_user_id', fields: ['user_id'] },
      { name: 'idx_rpm_pattern', fields: ['pattern'] },
      { name: 'idx_rpm_attiva', fields: ['attiva'] },
      { name: 'idx_rpm_user_pattern', fields: ['user_id', 'pattern'] },
    ];

    for (const idx of indexes) {
      try {
        await queryInterface.addIndex('regole_personali_merchant', idx.fields, { name: idx.name });
      } catch (e) {
        console.log(`Indice ${idx.name} già esistente, skip`);
      }
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.dropTable('regole_personali_merchant');
    } catch (e) {
      // ignore
    }
  },
};
