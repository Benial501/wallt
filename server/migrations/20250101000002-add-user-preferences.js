'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'mostra_scommesse', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      });
    } catch (e) {
      console.log('Colonna mostra_scommesse già esistente, skip');
    }

    try {
      await queryInterface.addColumn('users', 'mostra_investimenti', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      });
    } catch (e) {
      console.log('Colonna mostra_investimenti già esistente, skip');
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'mostra_scommesse');
    await queryInterface.removeColumn('users', 'mostra_investimenti');
  },
};
