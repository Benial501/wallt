'use strict';

// «Salta questo rinnovo» (CLAUDE.md Regola 28): una colonna su una tabella già
// protetta da RLS, quindi nessun hardening da ripetere.
module.exports = {
  async up(q, S) {
    await q.addColumn('abbonamenti', 'rinnovo_saltato', { type: S.DATEONLY, allowNull: true });
  },

  async down(q) {
    await q.removeColumn('abbonamenti', 'rinnovo_saltato');
  },
};
