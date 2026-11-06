'use strict';

// Giorno del rinnovo, conto di pagamento e addebito automatico degli abbonamenti
// (CLAUDE.md Regola 28). Aggiunge colonne a una tabella già protetta da RLS:
// nessuna tabella nuova, quindi nessun hardening da ripetere.
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.addColumn('abbonamenti', 'giorno_rinnovo', { type: S.SMALLINT, allowNull: true }, { transaction });
      // SET NULL: chiudere un conto non deve far sparire l'abbonamento.
      await q.addColumn('abbonamenti', 'conto_id', {
        type: S.INTEGER, allowNull: true, references: { model: 'conti', key: 'id' }, onDelete: 'SET NULL',
      }, { transaction });
      // Vero solo quando è stato l'abbonamento a creare la sua programmazione:
      // è ciò che autorizza a modificarla o a terminarla da qui.
      await q.addColumn('abbonamenti', 'addebito_automatico', {
        type: S.BOOLEAN, allowNull: false, defaultValue: false,
      }, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.removeColumn('abbonamenti', 'addebito_automatico', { transaction });
      await q.removeColumn('abbonamenti', 'conto_id', { transaction });
      await q.removeColumn('abbonamenti', 'giorno_rinnovo', { transaction });
    });
  },
};
