'use strict';

module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('investimenti');
    if (!columns.liquidabilita) await q.addColumn('investimenti', 'liquidabilita', {
      type: S.STRING(20), allowNull: false, defaultValue: 'sconosciuto',
    });
    if (!columns.giorni_disponibilita) await q.addColumn('investimenti', 'giorni_disponibilita', {
      type: S.INTEGER, allowNull: true,
    });
    if (!columns.condizioni_disponibilita) await q.addColumn('investimenti', 'condizioni_disponibilita', {
      type: S.STRING(255), allowNull: true,
    });
    if (!columns.data_apertura) await q.addColumn('investimenti', 'data_apertura', {
      type: S.DATEONLY, allowNull: true,
    });
  },
  async down(q) {
    const columns = await q.describeTable('investimenti');
    for (const name of ['data_apertura', 'condizioni_disponibilita', 'giorni_disponibilita', 'liquidabilita']) {
      if (columns[name]) await q.removeColumn('investimenti', name);
    }
  },
};
