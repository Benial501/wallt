'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const indexes = [
      ['movimenti', ['user_id'], 'idx_movimenti_user_id'],
      ['movimenti', ['data'], 'idx_movimenti_data'],
      ['movimenti', ['conto_id'], 'idx_movimenti_conto_id'],
      ['movimenti', ['categoria'], 'idx_movimenti_categoria'],
      ['conti', ['user_id'], 'idx_conti_user_id'],
      ['budget_mensili', ['user_id', 'mese', 'anno'], 'idx_budget_user_mese_anno'],
      ['obiettivi', ['user_id'], 'idx_obiettivi_user_id'],
      ['investimenti', ['user_id'], 'idx_investimenti_user_id'],
    ];

    for (const [table, fields, name] of indexes) {
      try {
        await queryInterface.addIndex(table, fields, { name });
      } catch (e) {
        console.log(`Indice ${name} già esistente, skip`);
      }
    }
  },

  async down(queryInterface) {
    const names = [
      'idx_movimenti_user_id',
      'idx_movimenti_data',
      'idx_movimenti_conto_id',
      'idx_movimenti_categoria',
      'idx_conti_user_id',
      'idx_budget_user_mese_anno',
      'idx_obiettivi_user_id',
      'idx_investimenti_user_id',
    ];

    const tables = ['movimenti', 'movimenti', 'movimenti', 'movimenti', 'conti', 'budget_mensili', 'obiettivi', 'investimenti'];
    for (let i = 0; i < names.length; i += 1) {
      try {
        await queryInterface.removeIndex(tables[i], names[i]);
      } catch (e) {
        // ignore
      }
    }
  },
};
