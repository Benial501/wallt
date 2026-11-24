'use strict';

// Il piano del budget a tre voci sta sul profilo: un solo piano per persona,
// che vale per ogni mese finché l'utente non lo cambia. Colonne su una tabella
// già protetta da RLS, quindi nessun hardening da ripetere.
//
// Le percentuali si salvano anche per i modelli pronti: cambiare un modello
// nel codice non deve alterare un piano già scelto. Il CHECK impone dal
// database che il piano sia tutto assente o tutto presente e faccia 100
// (Coding Rule 22): la validazione dell'API da sola non basterebbe.
const VINCOLO = 'profili_utente_budget_piano_valido';
const COLONNE_PCT = ['budget_pct_bisogni', 'budget_pct_desideri', 'budget_pct_futuro'];

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.addColumn('profili_utente', 'budget_modello', { type: S.STRING(30), allowNull: true }, { transaction });
      for (const colonna of COLONNE_PCT) {
        await q.addColumn('profili_utente', colonna, { type: S.SMALLINT, allowNull: true }, { transaction });
      }
      await q.sequelize.query(`
        ALTER TABLE profili_utente ADD CONSTRAINT ${VINCOLO} CHECK (
          (budget_modello IS NULL AND budget_pct_bisogni IS NULL AND budget_pct_desideri IS NULL AND budget_pct_futuro IS NULL)
          OR (
            budget_modello IN ('equilibrato', 'spese_fisse_alte', 'risparmio_deciso', 'personalizzato')
            -- Espliciti: un CHECK che vale NULL passa, e senza queste tre
            -- condizioni un piano con il modello e senza percentuali verrebbe
            -- accettato.
            AND budget_pct_bisogni IS NOT NULL
            AND budget_pct_desideri IS NOT NULL
            AND budget_pct_futuro IS NOT NULL
            AND budget_pct_bisogni BETWEEN 0 AND 100
            AND budget_pct_desideri BETWEEN 0 AND 100
            AND budget_pct_futuro BETWEEN 0 AND 100
            AND budget_pct_bisogni + budget_pct_desideri + budget_pct_futuro = 100
          )
        )`, { transaction });
    });
  },

  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(`ALTER TABLE profili_utente DROP CONSTRAINT IF EXISTS ${VINCOLO}`, { transaction });
      for (const colonna of [...COLONNE_PCT].reverse()) {
        await q.removeColumn('profili_utente', colonna, { transaction });
      }
      await q.removeColumn('profili_utente', 'budget_modello', { transaction });
    });
  },
};
