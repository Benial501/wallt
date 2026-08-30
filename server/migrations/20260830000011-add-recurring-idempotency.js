'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('movimenti', 'ricorrenza_origine_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'movimenti', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('movimenti', 'ricorrenza_periodo', {
      type: Sequelize.STRING(7),
      allowNull: true,
    });

    await queryInterface.addIndex(
      'movimenti',
      ['ricorrenza_origine_id', 'ricorrenza_periodo'],
      {
        name: 'uniq_movimenti_ricorrenza_periodo',
        unique: true,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('movimenti', 'uniq_movimenti_ricorrenza_periodo');
    await queryInterface.removeColumn('movimenti', 'ricorrenza_periodo');
    await queryInterface.removeColumn('movimenti', 'ricorrenza_origine_id');
  },
};
