'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'password_changed_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      console.log('Colonna password_changed_at già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('users', 'password_changed_at');
    } catch (e) {
      // ignore
    }
  },
};
