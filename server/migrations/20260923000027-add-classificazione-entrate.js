'use strict';

module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('movimenti');
    if (!columns.natura_entrata) {
      await q.addColumn('movimenti', 'natura_entrata', {
        type: S.STRING(20), allowNull: false, defaultValue: 'sconosciuto',
      });
    }
    if (!columns.periodicita_entrata) {
      await q.addColumn('movimenti', 'periodicita_entrata', {
        type: S.STRING(20), allowNull: false, defaultValue: 'sconosciuta',
      });
    }
    // Nessuna inferenza da categoria o dal flag che programma la ricorrenza.
  },
  async down(q) {
    const columns = await q.describeTable('movimenti');
    if (columns.periodicita_entrata) await q.removeColumn('movimenti', 'periodicita_entrata');
    if (columns.natura_entrata) await q.removeColumn('movimenti', 'natura_entrata');
  },
};
