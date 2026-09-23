'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('movimenti', 'ricorrente_mese', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Mese (1-12) per ricorrenza annuale. Ignorato per mensile/settimanale.',
    });

    // "YYYY-MM" (mensile, 7 char) e "YYYY" (annuale) entravano già in
    // STRING(7); la chiave di deduplica settimanale "YYYY-Www" (8 char) no.
    await queryInterface.changeColumn('movimenti', 'ricorrenza_periodo', {
      type: Sequelize.STRING(10),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('movimenti', 'ricorrenza_periodo', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });
    await queryInterface.removeColumn('movimenti', 'ricorrente_mese');
  },
};
