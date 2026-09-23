'use strict';

module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('movimenti');
    if (!columns.stato_ricorrenza) {
      // I record storici non hanno segni di sospensione: restano attivi.
      await q.addColumn('movimenti', 'stato_ricorrenza', {
        type: S.STRING(20), allowNull: false, defaultValue: 'attiva',
      });
    }
  },
  async down(q) {
    const columns = await q.describeTable('movimenti');
    if (columns.stato_ricorrenza) await q.removeColumn('movimenti', 'stato_ricorrenza');
  },
};
