'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('users', 'auth_provider', {
        type: Sequelize.ENUM('local', 'google'),
        defaultValue: 'local',
      });
    } catch (e) {
      console.log('Colonna auth_provider già esistente, skip');
    }

    try {
      await queryInterface.addColumn('users', 'google_id', {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
      });
    } catch (e) {
      console.log('Colonna google_id già esistente, skip');
    }

    try {
      await queryInterface.changeColumn('users', 'password', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    } catch (e) {
      console.log('Modifica password nullable già applicata, skip');
    }

    await queryInterface.sequelize.query(`
      UPDATE users
      SET auth_provider = 'google', password = NULL
      WHERE google_id IS NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // Le password Google rimosse non possono essere ripristinate
    try {
      await queryInterface.removeColumn('users', 'google_id');
    } catch (e) {
      // ignore
    }

    try {
      await queryInterface.removeColumn('users', 'auth_provider');
    } catch (e) {
      // ignore
    }

    try {
      await queryInterface.changeColumn('users', 'password', {
        type: Sequelize.STRING(255),
        allowNull: false,
      });
    } catch (e) {
      // ignore
    }
  },
};
