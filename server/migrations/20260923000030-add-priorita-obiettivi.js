'use strict';

/**
 * Priorità di un obiettivo (alta/media/bassa), per poterli ordinare — oggi
 * assente dal modello. Nullable, nessun default: un obiettivo esistente non
 * ha una priorità deducibile, resta esplicitamente "non impostata" invece
 * di ricadere silenziosamente su un valore inventato (stesso principio
 * delle altre colonne additive di questo lavoro: natura_entrata,
 * liquidabilita, stato_ricorrenza avevano tutte un default legacy
 * deducibile con certezza; qui non c'è).
 */
module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('obiettivi');
    if (!columns.priorita) {
      await q.addColumn('obiettivi', 'priorita', { type: S.STRING(10), allowNull: true });
      await q.sequelize.query(
        "ALTER TABLE obiettivi ADD CONSTRAINT obiettivi_priorita_valore CHECK (priorita IN ('alta','media','bassa'))",
      );
    }
  },
  async down(q) {
    const columns = await q.describeTable('obiettivi');
    if (columns.priorita) await q.removeColumn('obiettivi', 'priorita');
  },
};
