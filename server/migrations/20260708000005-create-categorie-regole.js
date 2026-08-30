'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crea tabella regole categoria
    try {
      await queryInterface.createTable('categorie_regole', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: Sequelize.INTEGER, allowNull: true },
        pattern: { type: Sequelize.STRING(255), allowNull: false },
        categoria: { type: Sequelize.STRING(100), allowNull: false },
        priorita: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
        attiva: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false },
      });
    } catch (e) {
      // Tabella potrebbe già esistere
      console.log('Tabella categorie_regole già esistente, skip create');
    }

    // Indici utili
    const indexes = [
      { name: 'idx_categorie_regole_user_id', fields: ['user_id'] },
      { name: 'idx_categorie_regole_categoria', fields: ['categoria'] },
      { name: 'idx_categorie_regole_attiva', fields: ['attiva'] },
    ];
    for (const idx of indexes) {
      try {
        await queryInterface.addIndex('categorie_regole', idx.fields, { name: idx.name });
      } catch (e) {
        console.log(`Indice ${idx.name} già esistente, skip`);
      }
    }

    // Seed regole globali (compatibilità col matcher keyword esistente).
    // Se l’utente non ha regole già presenti, queste forniscono un comportamento immediato.
    const seedRules = [
      // entrata
      { pattern: 'stipendio', categoria: 'stipendio', priorita: 80 },
      { pattern: 'salary', categoria: 'stipendio', priorita: 80 },
      { pattern: 'payroll', categoria: 'stipendio', priorita: 80 },
      { pattern: 'rimborso spese', categoria: 'altro_entrata', priorita: 60 },
      { pattern: 'rimborso', categoria: 'altro_entrata', priorita: 60 },
      { pattern: 'rimbors', categoria: 'altro_entrata', priorita: 60 },

      // uscita
      { pattern: 'esselunga', categoria: 'cibo_spesa', priorita: 80 },
      { pattern: 'coop', categoria: 'cibo_spesa', priorita: 80 },
      { pattern: 'conad', categoria: 'cibo_spesa', priorita: 80 },
      { pattern: 'lidl', categoria: 'cibo_spesa', priorita: 80 },
      { pattern: 'amazon', categoria: 'acquisti_vari', priorita: 75 },
      { pattern: 'zalando', categoria: 'acquisti_vari', priorita: 75 },
      { pattern: 'eni', categoria: 'benzina_trasporti', priorita: 75 },
      { pattern: 'q8', categoria: 'benzina_trasporti', priorita: 75 },
      { pattern: 'ip', categoria: 'benzina_trasporti', priorita: 75 },
      { pattern: 'netflix', categoria: 'abbonamenti', priorita: 70 },
      { pattern: 'spotify', categoria: 'abbonamenti', priorita: 70 },
      { pattern: 'disney', categoria: 'abbonamenti', priorita: 70 },
      { pattern: 'enel', categoria: 'bollette', priorita: 70 },
      { pattern: 'hera', categoria: 'bollette', priorita: 70 },
      { pattern: 'tim', categoria: 'bollette', priorita: 65 },
      { pattern: 'vodafone', categoria: 'bollette', priorita: 65 },
      { pattern: 'fastweb', categoria: 'bollette', priorita: 65 },
      { pattern: 'trenitalia', categoria: 'mezzi_pubblici', priorita: 70 },
      { pattern: 'italo', categoria: 'mezzi_pubblici', priorita: 70 },
    ];

    // Inserimento idempotente: proviamo ad inserire solo se manca una regola uguale.
    // (senza unique constraint, facciamo una query per ogni regola).
    const now = new Date();
    for (const rule of seedRules) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await queryInterface.sequelize.query(
        'SELECT id FROM categorie_regole WHERE user_id IS NULL AND pattern = :pattern AND categoria = :categoria AND attiva = true LIMIT 1',
        {
          replacements: { pattern: rule.pattern, categoria: rule.categoria },
          type: Sequelize.QueryTypes.SELECT,
        },
      );
      if (!existing || existing.length === 0) {
        // eslint-disable-next-line no-await-in-loop
        await queryInterface.bulkInsert('categorie_regole', [{
          user_id: null,
          pattern: rule.pattern,
          categoria: rule.categoria,
          priorita: rule.priorita,
          attiva: true,
          created_at: now,
          updated_at: now,
        }]);
      }
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.dropTable('categorie_regole');
    } catch (e) {
      // ignore
    }
  },
};
