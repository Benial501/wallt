'use strict';

/**
 * La decisione "questa riga bancaria non riguarda nessuna piattaforma".
 *
 * Una riga portata dal conto collegato e categorizzata come deposito o
 * prelievo di scommesse è, di per sé, una domanda aperta: su quale
 * piattaforma è finito il denaro? Confermarla non ha bisogno di nessuna
 * colonna, perché la conferma TRASFORMA la riga in un trasferimento verso il
 * conto di gioco, e quella trasformazione è essa stessa il registro: una
 * proposta confermata non è più un'uscita non attribuita.
 *
 * Il caso che una colonna serve a ricordare è l'altro: l'utente dice che non
 * era un deposito. Senza di essa l'unico modo di far smettere la domanda
 * sarebbe falsare la categoria di un movimento che la banca ha davvero
 * emesso verso un operatore di gioco.
 *
 * NOT NULL con default false: per le righe già esistenti "nessuno ha ancora
 * deciso" e "non archiviata" sono la stessa cosa, e un booleano a tre stati
 * sarebbe una distinzione che nessuno legge.
 */

module.exports = {
  async up(q, S) {
    await q.addColumn('movimenti', 'scommesse_proposta_archiviata', {
      type: S.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(q) {
    await q.removeColumn('movimenti', 'scommesse_proposta_archiviata');
  },
};
