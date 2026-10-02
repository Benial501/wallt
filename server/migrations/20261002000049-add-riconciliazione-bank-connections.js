'use strict';

/**
 * Due modifiche a `bank_connections` per la riconciliazione con i conti
 * esistenti.
 *
 * 1. Lo stato `da_riconciliare`. Il vincolo CHECK elencava i sei stati
 *    precedenti: è il motivo per cui una stringa arbitraria non entra in
 *    quella colonna, ed è giusto che aggiungere uno stato costi una
 *    migrazione.
 *
 * 2. `import_da`: la soglia sotto la quale non si importa. NULLABLE, e il
 *    null non è "non impostato per sbaglio" ma un valore con un significato
 *    preciso — "nessuna soglia, vale la finestra dei 90 giorni". È ciò che
 *    fa comportare le connessioni già esistenti esattamente come prima.
 */

const VINCOLO = 'bank_connections_status';

const STATI_NUOVI = "'in_attesa','da_riconciliare','attiva','consenso_scaduto',"
  + "'errore','sospesa_entitlement','revocata'";
const STATI_VECCHI = "'in_attesa','attiva','consenso_scaduto','errore',"
  + "'sospesa_entitlement','revocata'";

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + `CHECK (status IN (${STATI_NUOVI}))`,
        { transaction },
      );
      await q.addColumn('bank_connections', 'import_da', {
        type: S.DATEONLY,
        allowNull: true,
      }, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      // Le righe `da_riconciliare` violerebbero il vincolo vecchio. Vengono
      // marcate `revocata` invece di far fallire il rollback: sono
      // connessioni mai arrivate a importare nulla, quindi non si perde
      // nessun dato finanziario, e un `down` che non funziona è peggio.
      await q.sequelize.query(
        "UPDATE bank_connections SET status = 'revocata', state_hash = NULL "
        + "WHERE status = 'da_riconciliare'",
        { transaction },
      );
      await q.removeColumn('bank_connections', 'import_da', { transaction });
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + `CHECK (status IN (${STATI_VECCHI}))`,
        { transaction },
      );
    });
  },
};
