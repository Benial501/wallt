'use strict';

/**
 * Il tetto di sincronizzazioni manuali per giornata.
 *
 * Due colonne, non una: il contatore da solo non direbbe *a quale giorno* si
 * riferisce, e al primo passaggio di mezzanotte sarebbe indistinguibile da un
 * contatore già pieno. La coppia (giorno civile, quante in quel giorno) è
 * l'unica forma che si azzera da sé senza bisogno di un cron che la ripulisca
 * — stessa ragione per cui la scadenza di un entitlement si legge dalla data
 * e non da una colonna di stato (Regola 23).
 *
 * `sync_manuali_giorno_data` è un giorno CIVILE nel fuso applicativo
 * (Europe/Rome), non un istante: per questo è DATEONLY. Su Vercel il processo
 * gira in UTC, quindi senza questa distinzione il limite si azzererebbe
 * all'una di notte d'estate invece che a mezzanotte (Regola 16).
 *
 * Il NULL iniziale significa "nessuna sincronizzazione manuale in nessun
 * giorno noto": le connessioni già esistenti partono quindi con due gettoni
 * disponibili, che è il comportamento giusto il giorno in cui il limite
 * entra in vigore.
 */

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.addColumn('bank_connections', 'sync_manuali_giorno', {
        type: S.INTEGER,
        allowNull: false,
        defaultValue: 0,
      }, { transaction });
      await q.addColumn('bank_connections', 'sync_manuali_giorno_data', {
        type: S.DATEONLY,
        allowNull: true,
      }, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.removeColumn('bank_connections', 'sync_manuali_giorno', { transaction });
      await q.removeColumn('bank_connections', 'sync_manuali_giorno_data', { transaction });
    });
  },
};
