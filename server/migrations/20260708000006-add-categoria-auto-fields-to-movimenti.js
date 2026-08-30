'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('movimenti', 'categoria_automatica', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    } catch (e) {
      console.log('Colonna categoria_automatica già esistente, skip');
    }

    try {
      await queryInterface.addColumn('movimenti', 'categoria_confidenza', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    } catch (e) {
      console.log('Colonna categoria_confidenza già esistente, skip');
    }

    try {
      await queryInterface.addColumn('movimenti', 'categoria_modificata', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    } catch (e) {
      console.log('Colonna categoria_modificata già esistente, skip');
    }

    // Indici minimi per filtri futuri (optional)
    const indexes = [
      { name: 'idx_movimenti_categoria_automatica', fields: ['categoria_automatica'] },
      { name: 'idx_movimenti_categoria_confidenza', fields: ['categoria_confidenza'] },
      { name: 'idx_movimenti_categoria_modificata', fields: ['categoria_modificata'] },
    ];

    for (const idx of indexes) {
      try {
        await queryInterface.addIndex('movimenti', idx.fields, { name: idx.name });
      } catch (e) {
        console.log(`Indice ${idx.name} già esistente, skip`);
      }
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('movimenti', 'categoria_automatica');
    } catch (e) {
      // ignore
    }
    try {
      await queryInterface.removeColumn('movimenti', 'categoria_confidenza');
    } catch (e) {
      // ignore
    }
    try {
      await queryInterface.removeColumn('movimenti', 'categoria_modificata');
    } catch (e) {
      // ignore
    }
  },
};

