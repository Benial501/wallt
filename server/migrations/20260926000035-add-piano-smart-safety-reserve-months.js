'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (!columns.mesi_riserva_piano_smart) {
      await queryInterface.addColumn('profili_utente', 'mesi_riserva_piano_smart', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('profili_utente');
    if (columns.mesi_riserva_piano_smart) {
      await queryInterface.removeColumn('profili_utente', 'mesi_riserva_piano_smart');
    }
  },
};
