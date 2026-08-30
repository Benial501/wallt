'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'use_ai_categorization', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    } catch (e) {
      console.log('Colonna use_ai_categorization già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('users', 'use_ai_categorization');
    } catch (e) {
      // ignore
    }
  },
};
