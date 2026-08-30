'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'privacy_accepted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      console.log('Colonna privacy_accepted_at già esistente, skip');
    }

    try {
      await queryInterface.addColumn('users', 'terms_accepted_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } catch (e) {
      console.log('Colonna terms_accepted_at già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('users', 'terms_accepted_at');
    } catch (e) {
      // ignore
    }

    try {
      await queryInterface.removeColumn('users', 'privacy_accepted_at');
    } catch (e) {
      // ignore
    }
  },
};
