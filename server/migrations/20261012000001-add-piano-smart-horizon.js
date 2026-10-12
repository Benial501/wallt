'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (!columns.orizzonte_tipo) {
      await queryInterface.addColumn('profili_utente', 'orizzonte_tipo', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'mensile',
      });
    }
    if (!columns.orizzonte_data) {
      await queryInterface.addColumn('profili_utente', 'orizzonte_data', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (columns.orizzonte_data) {
      await queryInterface.removeColumn('profili_utente', 'orizzonte_data');
    }
    if (columns.orizzonte_tipo) {
      await queryInterface.removeColumn('profili_utente', 'orizzonte_tipo');
    }
  },
};
