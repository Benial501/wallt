'use strict';

/**
 * Ammette `enablebanking` fra i provider di una connessione bancaria.
 *
 * Il vincolo `bank_connections_provider` elencava `gocardless` e `sandbox`.
 * Non era una svista da correggere: è il motivo per cui una stringa
 * arbitraria non può finire in quella colonna, ed è giusto che aggiungere un
 * provider costi una migrazione — così il database resta la fonte di verità
 * su cosa è un provider valido, insieme a `constants/bankSync.js`.
 *
 * Perché serve adesso: dal luglio 2025 GoCardless ha disabilitato i nuovi
 * account Bank Account Data, quindi quell'adapter non è più ottenibile da
 * zero. Enable Banking lo sostituisce — registrazione self-service, licenza
 * AISP del fornitore — e il suo adapter esiste già
 * (`services/bankSync/providers/EnableBankingProvider.js`). Senza questa
 * migrazione la prima connessione fallirebbe sull'INSERT, non in un punto
 * che spiega perché.
 *
 * `gocardless` resta ammesso: chi avesse già una connessione attiva non deve
 * perderla, e il vincolo non è il posto dove dichiarare quale provider
 * consigliamo oggi (quello sta in `app_config.bank_sync_provider`).
 */

const VINCOLO = 'bank_connections_provider';

module.exports = {
  async up(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + "CHECK (provider IN ('gocardless','enablebanking','sandbox'))",
        { transaction },
      );
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      // Tornando indietro le righe `enablebanking` violerebbero il vincolo
      // vecchio: vengono marcate `revocata` e riportate al provider
      // precedente, invece di far fallire il rollback. È una perdita di
      // informazione accettabile — il rollback di questa migrazione ha senso
      // solo in sviluppo — ed è preferibile a un `down` che non funziona.
      await q.sequelize.query(
        "UPDATE bank_connections SET status = 'revocata', provider = 'gocardless' "
        + "WHERE provider = 'enablebanking'",
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS ${VINCOLO}`,
        { transaction },
      );
      await q.sequelize.query(
        `ALTER TABLE bank_connections ADD CONSTRAINT ${VINCOLO} `
        + "CHECK (provider IN ('gocardless','sandbox'))",
        { transaction },
      );
    });
  },
};
