'use strict';

/**
 * Riallinea i conti di gioco alla piattaforma collegata.
 *
 * Conto di gioco e piattaforma sono due viste dello stesso denaro, ma fino a
 * `aggiornaSaldoConto` (services/scommesseContoSync.service.js) c'erano punti
 * che scrivevano l'uno senza l'altro: eliminare o modificare un movimento su un
 * conto di gioco ne cambiava il saldo lasciando ferma la piattaforma. Il conto
 * restava indietro e il patrimonio totale dell'utente mostrava un numero
 * sbagliato.
 *
 * Fonte di verità: la PIATTAFORMA. Ogni movimento di gioco (deposito, prelievo,
 * vincita, perdita) la scrive dentro la transazione e il conto ne è solo il
 * riflesso (`syncContoSaldoFromPiattaforma`); i due bug di disallineamento
 * toccavano il conto, non lei. Il movimento cancellato inoltre non lascia
 * traccia in `movimenti`, quindi il ledger dei movimenti non può ricostruire il
 * valore giusto: la piattaforma sì.
 *
 * Eccezione: se sul conto di gioco esistono trasferimenti fatti dalla schermata
 * Conti (categoria 'trasferimento'), quel denaro non compare in
 * `movimenti_scommesse` e la piattaforma non è più il registro completo. In quel
 * caso non si può stabilire quale lato sia corretto: la riga viene lasciata
 * intatta e segnalata, da verificare a mano.
 *
 * Idempotente: una seconda esecuzione non trova più righe divergenti.
 *
 * @type {import('sequelize-cli').Migration}
 */

const CONDIZIONI_RIALLINEABILI = `
    p.conto_id = c.id
    AND p.attiva = true
    AND c.attivo = true
    AND c.saldo IS DISTINCT FROM p.saldo
    AND NOT EXISTS (
      SELECT 1 FROM movimenti m
      WHERE m.tipo = 'trasferimento'
        AND m.categoria = 'trasferimento'
        AND (m.conto_id = c.id OR m.conto_destinazione_id = c.id)
    )
`;

module.exports = {
  async up(queryInterface) {
    // Prima si segnala ciò che NON viene toccato: sono i casi ambigui, e
    // passano sotto silenzio proprio perché la migrazione li salta.
    const [ambigui] = await queryInterface.sequelize.query(`
      SELECT c.id AS conto_id, c.user_id, c.saldo AS saldo_conto, p.saldo AS saldo_piattaforma
      FROM conti c
      JOIN piattaforme_scommesse p ON p.conto_id = c.id
      WHERE p.attiva = true
        AND c.attivo = true
        AND c.saldo IS DISTINCT FROM p.saldo
        AND EXISTS (
          SELECT 1 FROM movimenti m
          WHERE m.tipo = 'trasferimento'
            AND m.categoria = 'trasferimento'
            AND (m.conto_id = c.id OR m.conto_destinazione_id = c.id)
        );
    `);

    const [riallineati] = await queryInterface.sequelize.query(`
      UPDATE conti c
      SET saldo = p.saldo, updated_at = NOW()
      FROM piattaforme_scommesse p
      WHERE ${CONDIZIONI_RIALLINEABILI}
      RETURNING c.id AS conto_id, c.user_id, c.saldo AS saldo_nuovo;
    `);

    console.log(`[riallinea-conti-di-gioco] conti riallineati: ${riallineati.length}`);
    if (ambigui.length) {
      console.warn(
        `[riallinea-conti-di-gioco] ${ambigui.length} conti lasciati intatti perché `
        + 'hanno trasferimenti dalla schermata Conti: verificarli a mano. '
        + `conto_id: ${ambigui.map((r) => r.conto_id).join(', ')}`,
      );
    }
  },

  async down() {
    // Nessun rollback: i valori precedenti erano il danno, non uno stato da
    // ripristinare, e non sono ricostruibili. Rimetterli reintrodurrebbe la
    // divergenza.
  },
};
