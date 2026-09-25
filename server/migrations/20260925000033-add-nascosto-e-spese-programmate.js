'use strict';

module.exports = {
  async up(q, S) {
    const conti = await q.describeTable('conti');
    if (!conti.nascosto) {
      // I conti storici sono tutti spendibili: nascondere è una scelta
      // esplicita, mai un default.
      await q.addColumn('conti', 'nascosto', {
        type: S.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }

    const movimenti = await q.describeTable('movimenti');
    if (!movimenti.ricorrente_data) {
      // Data dell'addebito unico: ha senso solo con
      // ricorrente_frequenza = 'una_tantum'. ricorrente_frequenza è
      // varchar(20), non un ENUM Postgres: il valore nuovo non richiede
      // nessuna modifica di tipo.
      await q.addColumn('movimenti', 'ricorrente_data', {
        type: S.DATEONLY, allowNull: true,
      });
    }
  },
  async down(q) {
    const conti = await q.describeTable('conti');
    if (conti.nascosto) await q.removeColumn('conti', 'nascosto');
    const movimenti = await q.describeTable('movimenti');
    if (movimenti.ricorrente_data) await q.removeColumn('movimenti', 'ricorrente_data');
  },
};
