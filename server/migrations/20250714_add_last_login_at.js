'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'last_login_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      console.log('Colonna last_login_at già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('users', 'last_login_at');
    } catch (e) {
      // ignore
    }
  },
};
