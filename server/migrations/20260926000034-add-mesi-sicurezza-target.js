'use strict';

module.exports = {
  async up(q, S) {
    const conti = await q.describeTable('conti');
    if (!conti.mesi_sicurezza_target) {
      // La soglia del fondo di emergenza, in mesi di spese essenziali. Sta sul
      // conto perché il conto È il fondo (vedi
      // docs/superpowers/specs/2026-09-26-fondo-emergenza-design.md). La soglia
      // in euro non viene mai salvata: è sempre mesi × spese essenziali
      // mensili, ricalcolata a ogni lettura, così resta corretta quando le
      // spese cambiano. Null su tutti i conti che non sono il fondo.
      await q.addColumn('conti', 'mesi_sicurezza_target', {
        type: S.INTEGER, allowNull: true,
      });
    }

    // Un solo fondo di emergenza attivo per utente, garantito dal database e
    // non solo dal controller: la verifica "esiste già?" seguita da un insert
    // non è atomica, e due richieste contemporanee creerebbero due fondi.
    // Indice parziale (Postgres): vincola solo le righe del fondo, e un fondo
    // soft-eliminato (attivo: false) non impedisce di crearne uno nuovo.
    const indici = await q.showIndex('conti');
    if (!indici.some((i) => i.name === 'conti_un_solo_fondo_emergenza')) {
      await q.addIndex('conti', {
        name: 'conti_un_solo_fondo_emergenza',
        fields: ['user_id'],
        unique: true,
        where: { tipo: 'emergenza', attivo: true },
      });
    }
  },
  async down(q) {
    const indici = await q.showIndex('conti');
    if (indici.some((i) => i.name === 'conti_un_solo_fondo_emergenza')) {
      await q.removeIndex('conti', 'conti_un_solo_fondo_emergenza');
    }
    const conti = await q.describeTable('conti');
    if (conti.mesi_sicurezza_target) await q.removeColumn('conti', 'mesi_sicurezza_target');
  },
};
