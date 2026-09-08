'use strict';

/**
 * Immagine profilo caricata dall'utente, salvata come data URL.
 * Colonna separata da `users.avatar`, che contiene l'URL della foto Google
 * ed è limitata a 500 caratteri: tenendole distinte la foto Google resta
 * disponibile come fallback quando l'utente rimuove quella caricata.
 */
module.exports = {
  async up(q, S) {
    const table = await q.describeTable('users');
    if (table.avatar_immagine) return;

    await q.addColumn('users', 'avatar_immagine', {
      type: S.TEXT,
      allowNull: true,
    });
  },

  async down(q) {
    const table = await q.describeTable('users');
    if (!table.avatar_immagine) return;

    await q.removeColumn('users', 'avatar_immagine');
  },
};
