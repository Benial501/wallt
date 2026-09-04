'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('users')) {
      console.log('Tabelle già esistenti, skip create-all-tables');
      return;
    }

    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      avatar: { type: Sequelize.STRING(500), allowNull: true },
      valuta: { type: Sequelize.STRING(3), defaultValue: 'EUR' },
      tema: { type: Sequelize.STRING(10), defaultValue: 'dark' },
      reminder: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('profili_utente', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      fascia_eta: { type: Sequelize.STRING(50), allowNull: true },
      situazione_lavorativa: { type: Sequelize.STRING(100), allowNull: true },
      entrata_fissa: { type: Sequelize.BOOLEAN, defaultValue: false },
      entrata_mensile: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      situazione_abitativa: { type: Sequelize.STRING(100), allowNull: true },
      costo_abitazione: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      paga_bollette: { type: Sequelize.STRING(10), defaultValue: 'no' },
      stima_bollette: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      ha_auto: { type: Sequelize.BOOLEAN, defaultValue: false },
      ha_moto: { type: Sequelize.BOOLEAN, defaultValue: false },
      usa_mezzi_pubblici: { type: Sequelize.BOOLEAN, defaultValue: false },
      spesa_benzina: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      spesa_mezzi: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      spese_fisse_extra: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      risparmia: { type: Sequelize.STRING(50), allowNull: true },
      ha_investimenti: { type: Sequelize.STRING(50), allowNull: true },
      fa_scommesse: { type: Sequelize.STRING(50), defaultValue: 'no' },
      onboarding_completato: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('conti', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      nome: { type: Sequelize.STRING(100), allowNull: false },
      tipo: { type: Sequelize.STRING(50), defaultValue: 'banca' },
      saldo: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      icona: { type: Sequelize.STRING(50), allowNull: true },
      colore: { type: Sequelize.STRING(20), allowNull: true },
      ordine: { type: Sequelize.INTEGER, defaultValue: 0 },
      attivo: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('movimenti', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      conto_id: { type: Sequelize.INTEGER, allowNull: false },
      conto_destinazione_id: { type: Sequelize.INTEGER, allowNull: true },
      tipo: { type: Sequelize.STRING(20), allowNull: false },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      categoria: { type: Sequelize.STRING(100), allowNull: true },
      descrizione: { type: Sequelize.STRING(500), allowNull: true },
      data: { type: Sequelize.DATEONLY, allowNull: false },
      ricorrente: { type: Sequelize.BOOLEAN, defaultValue: false },
      ricorrente_frequenza: { type: Sequelize.STRING(20), allowNull: true },
      ricorrente_giorno: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('budget_mensili', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      mese: { type: Sequelize.INTEGER, allowNull: false },
      anno: { type: Sequelize.INTEGER, allowNull: false },
      importo_totale: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      generato_da_ai: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('budget_categorie', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      budget_id: { type: Sequelize.INTEGER, allowNull: false },
      categoria: { type: Sequelize.STRING(100), allowNull: false },
      percentuale: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('obiettivi', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      nome: { type: Sequelize.STRING(200), allowNull: false },
      importo_target: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      importo_attuale: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      deadline: { type: Sequelize.DATEONLY, allowNull: true },
      icona: { type: Sequelize.STRING(50), allowNull: true },
      completato: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('obiettivo_contributi', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      obiettivo_id: { type: Sequelize.INTEGER, allowNull: false },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      data: { type: Sequelize.DATEONLY, allowNull: false },
      nota: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('piattaforme_scommesse', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      nome: { type: Sequelize.STRING(100), allowNull: false },
      saldo: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      limite_mensile: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      attiva: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('movimenti_scommesse', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      piattaforma_id: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      tipo: { type: Sequelize.STRING(20), allowNull: false },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      data: { type: Sequelize.DATEONLY, allowNull: false },
      nota: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('investimenti', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      nome_piattaforma: { type: Sequelize.STRING(100), allowNull: false },
      tipo: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'azioni' },
      saldo_attuale: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      colore: { type: Sequelize.STRING(7), defaultValue: '#6C5CE7' },
      attivo: { type: Sequelize.BOOLEAN, defaultValue: true },
      note: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('movimenti_investimento', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      investimento_id: { type: Sequelize.INTEGER, allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: false },
      tipo: { type: Sequelize.STRING(20), allowNull: false },
      importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      data: { type: Sequelize.DATEONLY, allowNull: false },
      nota: { type: Sequelize.STRING(255), allowNull: true },
      saldo_dopo: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('movimenti_investimento');
    await queryInterface.dropTable('investimenti');
    await queryInterface.dropTable('movimenti_scommesse');
    await queryInterface.dropTable('piattaforme_scommesse');
    await queryInterface.dropTable('obiettivo_contributi');
    await queryInterface.dropTable('obiettivi');
    await queryInterface.dropTable('budget_categorie');
    await queryInterface.dropTable('budget_mensili');
    await queryInterface.dropTable('movimenti');
    await queryInterface.dropTable('conti');
    await queryInterface.dropTable('profili_utente');
    await queryInterface.dropTable('users');
  },
};
