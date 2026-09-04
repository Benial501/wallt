'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('users');

    if (!columns.auth_provider) {
      await queryInterface.addColumn('users', 'auth_provider', {
        type: Sequelize.STRING(20),
        defaultValue: 'local',
      });
    }

    if (!columns.google_id) {
      await queryInterface.addColumn('users', 'google_id', {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
      });
    }

    if (columns.password && columns.password.allowNull === false) {
      await queryInterface.changeColumn('users', 'password', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('users');
    if (columns.google_id) await queryInterface.removeColumn('users', 'google_id');
    if (columns.auth_provider) await queryInterface.removeColumn('users', 'auth_provider');
    if (columns.password && columns.password.allowNull === true) {
      await queryInterface.changeColumn('users', 'password', {
        type: Sequelize.STRING(255),
        allowNull: false,
      });
    }
  },
};
