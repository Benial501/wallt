'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const addIndexSafe = async (table, fields, name) => {
      try {
        await queryInterface.addIndex(table, fields, { name });
      } catch (e) {
        console.log(`Indice ${name} già esistente, skip`);
      }
    };

    // Query tipica: WHERE user_id = ? ORDER BY data DESC
    await addIndexSafe('movimenti', [
      { attribute: 'user_id', order: 'ASC' },
      { attribute: 'data', order: 'DESC' },
    ], 'idx_movimenti_user_data_desc');

    // Già presente in 20250101000003; idempotente per DB non migrati
    await addIndexSafe('movimenti', ['conto_id'], 'idx_movimenti_conto_id');

    await addIndexSafe('movimenti_scommesse', [
      { attribute: 'user_id', order: 'ASC' },
      { attribute: 'data', order: 'DESC' },
    ], 'idx_mov_scommesse_user_data_desc');

    await addIndexSafe('movimenti_investimento', [
      { attribute: 'user_id', order: 'ASC' },
      { attribute: 'data', order: 'DESC' },
    ], 'idx_mov_investimento_user_data_desc');

    // Ordine (user_id, anno, mese) per lookup budget per periodo
    await addIndexSafe('budget_mensili', ['user_id', 'anno', 'mese'], 'idx_budget_user_anno_mese');

    // Già creati nelle migration delle rispettive tabelle; idempotenti
    await addIndexSafe('regole_personali_merchant', ['user_id'], 'idx_rpm_user_id');
    await addIndexSafe('categorie_regole', ['user_id'], 'idx_categorie_regole_user_id');
  },

  async down(queryInterface) {
    const removeIndexSafe = async (table, name) => {
      try {
        await queryInterface.removeIndex(table, name);
      } catch (e) {
        // ignore
      }
    };

    await removeIndexSafe('movimenti', 'idx_movimenti_user_data_desc');
    await removeIndexSafe('movimenti_scommesse', 'idx_mov_scommesse_user_data_desc');
    await removeIndexSafe('movimenti_investimento', 'idx_mov_investimento_user_data_desc');
    await removeIndexSafe('budget_mensili', 'idx_budget_user_anno_mese');
  },
};
