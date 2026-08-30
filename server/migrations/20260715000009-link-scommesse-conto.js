'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('piattaforme_scommesse', 'conto_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'conti', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    } catch (e) {
      console.log('Colonna conto_id su piattaforme_scommesse già esistente, skip');
    }

    try {
      await queryInterface.addIndex('piattaforme_scommesse', ['conto_id'], {
        name: 'idx_piattaforme_scommesse_conto_id',
        unique: true,
      });
    } catch (e) {
      console.log('Indice idx_piattaforme_scommesse_conto_id già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('piattaforme_scommesse', 'idx_piattaforme_scommesse_conto_id');
    } catch (e) {
      // ignore
    }
    try {
      await queryInterface.removeColumn('piattaforme_scommesse', 'conto_id');
    } catch (e) {
      // ignore
    }
  },
};
