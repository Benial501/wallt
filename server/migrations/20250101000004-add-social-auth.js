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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'google_id');
    await queryInterface.removeColumn('users', 'auth_provider');
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};
