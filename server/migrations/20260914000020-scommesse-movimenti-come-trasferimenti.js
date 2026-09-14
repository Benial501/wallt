'use strict';

/**
 * I depositi e i prelievi su una piattaforma di scommesse erano registrati
 * come uscite ed entrate: comparivano quindi fra le spese e le entrate del
 * mese, pur essendo solo spostamenti di denaro fra due conti dell'utente.
 * Li convertiamo in trasferimenti, ricostruendo il conto di destinazione dal
 * collegamento piattaforma → conto. Il budget "scommesse" continua a contarli
 * (vedi services/budgetStato.service.js).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // Deposito: dal conto indicato sul movimento al conto di gioco.
    await queryInterface.sequelize.query(`
      UPDATE movimenti m
      SET tipo = 'trasferimento',
          conto_destinazione_id = p.conto_id
      FROM piattaforme_scommesse p
      WHERE m.categoria = 'deposito_scommesse'
        AND m.tipo = 'uscita'
        AND p.user_id = m.user_id
        AND p.conto_id IS NOT NULL
        AND p.conto_id <> m.conto_id
        AND m.descrizione = 'Deposito ' || p.nome;
    `);

    // Prelievo: dal conto di gioco al conto indicato sul movimento.
    await queryInterface.sequelize.query(`
      UPDATE movimenti m
      SET tipo = 'trasferimento',
          conto_destinazione_id = m.conto_id,
          conto_id = p.conto_id
      FROM piattaforme_scommesse p
      WHERE m.categoria = 'prelievo_scommesse'
        AND m.tipo = 'entrata'
        AND p.user_id = m.user_id
        AND p.conto_id IS NOT NULL
        AND p.conto_id <> m.conto_id
        AND m.descrizione = 'Prelievo ' || p.nome;
    `);

    // Movimenti di cui non si riesce a ricostruire la piattaforma (nome
    // cambiato, piattaforma eliminata): restano fuori dalle analisi comunque,
    // senza conto di destinazione.
    await queryInterface.sequelize.query(`
      UPDATE movimenti
      SET tipo = 'trasferimento'
      WHERE (categoria = 'deposito_scommesse' AND tipo = 'uscita')
         OR (categoria = 'prelievo_scommesse' AND tipo = 'entrata');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE movimenti
      SET tipo = 'uscita',
          conto_destinazione_id = NULL
      WHERE categoria = 'deposito_scommesse' AND tipo = 'trasferimento';
    `);

    await queryInterface.sequelize.query(`
      UPDATE movimenti
      SET tipo = 'entrata',
          conto_id = COALESCE(conto_destinazione_id, conto_id),
          conto_destinazione_id = NULL
      WHERE categoria = 'prelievo_scommesse' AND tipo = 'trasferimento';
    `);
  },
};
