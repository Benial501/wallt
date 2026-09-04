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

    await queryInterface.sequelize.query(`
      UPDATE users
      SET auth_provider = 'google', password = NULL
      WHERE google_id IS NOT NULL
    `);
  },

  async down() {
    // Migrazione duplicata storica: lo schema appartiene alla precedente
    // 20250101000004-add-social-auth e viene rimosso dal suo rollback.
  },
};
