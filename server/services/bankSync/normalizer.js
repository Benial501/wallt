const crypto = require('crypto');
const {
  STATI_IMPORTABILI, TX_BOOKED, ORIGINE_OPEN_BANKING,
} = require('../../constants/bankSync');

/**
 * ProviderTransaction → VoltTransaction (il movimento WALLT).
 *
 * È il confine fra "la forma del provider" e "la forma di WALLT". Dopo questo
 * file nessuno sa più da quale banca arrivi un dato: il motore di
 * sincronizzazione lavora sulla stessa forma che usano l'import da file e
 * l'inserimento manuale, e per questo può riusare la deduplica, la cascata
 * di categorizzazione e la scrittura dei movimenti già esistenti invece di
 * averne una copia propria (Coding Rule 6).
 *
 * ── La convenzione dei segni sta solo qui ────────────────────────────────
 * Le banche danno importi firmati (negativo = uscita); WALLT ha `tipo` più
 * un importo sempre positivo (`deltaSaldo`, Regola 1). La traduzione avviene
 * in un punto solo: un provider che la facesse da sé farebbe rientrare la
 * propria convenzione dentro WALLT.
 *
 * ── Cosa viene scartato, e perché scartare è la scelta giusta ────────────
 *  • le transazioni non `booked`: una pending non è ancora una spesa, e non
 *    scriverla è la garanzia più forte contro il doppio conteggio
 *    pending → booked (constants/bankSync.js, STATI_IMPORTABILI);
 *  • gli importi nulli o non numerici: non sono movimenti;
 *  • le transazioni senza data: in WALLT la data è obbligatoria e inventarla
 *    sposterebbe una spesa in un mese che non le appartiene, falsando medie,
 *    budget e Piano Smart;
 *  • le transazioni in una valuta diversa da quella del conto: WALLT non ha
 *    tassi di cambio, e trattare 50 USD come 50 EUR corromperebbe i dati
 *    finanziari. Vengono contate e riportate, non convertite a caso.
 *
 * Ogni scarto è contato: l'esito della sincronizzazione dice quante righe non
 * sono entrate e perché, invece di far sparire dati in silenzio.
 */

const round2 = (n) => Math.round(n * 100) / 100;

const dataValida = (valore) => typeof valore === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valore);

/**
 * Impronta per le transazioni che il provider consegna SENZA identificatore
 * stabile.
 *
 * Deliberatamente NON è "data + importo": due caffè da 1,20 € lo stesso
 * giorno sono due spese reali, e un'impronta così le fonderebbe in una,
 * perdendo denaro dell'utente. Entra anche la descrizione normalizzata, e
 * l'impronta serve soltanto a dare una chiave stabile *dentro un batch*: la
 * deduplica contro lo storico la fa `DuplicateChecker`, che confronta anche
 * la similarità del testo ed è già in uso per l'import da file.
 *
 * L'impronta non viene salvata come `external_transaction_id`: un id
 * instabile nel database sarebbe peggio di nessun id, perché la UNIQUE lo
 * tratterebbe come affidabile.
 */
const impronta = (tx, indice) => {
  const base = [
    tx.bookingDate ?? '',
    tx.valueDate ?? '',
    String(tx.importo ?? ''),
    String(tx.descrizione ?? '').toLowerCase().replace(/\s+/g, ' ').trim(),
    // L'indice distingue due righe altrimenti identiche nello stesso
    // estratto: se la banca le manda entrambe, sono due operazioni.
    String(indice),
  ].join('|');
  return `fp-${crypto.createHash('sha256').update(base).digest('hex').slice(0, 24)}`;
};

/**
 * @param {Object} dati
 * @param {Array}  dati.transazioni   ProviderTransaction[]
 * @param {number} dati.contoId
 * @param {number} dati.connectionId
 * @param {string|null} dati.valutaConto
 * @returns {{movimenti: Array, scartate: Object}}
 */
function normalizzaTransazioni({
  transazioni, contoId, connectionId, valutaConto = null,
}) {
  const scartate = {
    non_contabilizzate: 0,
    importo_non_valido: 0,
    data_assente: 0,
    valuta_diversa: 0,
  };
  const movimenti = [];

  (Array.isArray(transazioni) ? transazioni : []).forEach((tx, indice) => {
    if (!STATI_IMPORTABILI.includes(tx.status)) {
      scartate.non_contabilizzate += 1;
      return;
    }

    const importoFirmato = Number(tx.importo);
    if (!Number.isFinite(importoFirmato) || importoFirmato === 0) {
      scartate.importo_non_valido += 1;
      return;
    }

    const data = dataValida(tx.bookingDate) ? tx.bookingDate
      : (dataValida(tx.valueDate) ? tx.valueDate : null);
    if (!data) {
      scartate.data_assente += 1;
      return;
    }

    if (valutaConto && tx.valuta && tx.valuta !== valutaConto) {
      scartate.valuta_diversa += 1;
      return;
    }

    const esterno = typeof tx.providerTransactionId === 'string' && tx.providerTransactionId.trim()
      ? tx.providerTransactionId.trim().slice(0, 255)
      : null;

    movimenti.push({
      // Chiave del batch: serve a DuplicateChecker e a CategoryMatcherService
      // per rimettere insieme i risultati. Se il provider dà un id stabile è
      // quello; altrimenti un'impronta, che però non viene persistita.
      clientTxId: esterno ?? impronta(tx, indice),
      external_transaction_id: esterno,

      conto_id: contoId,
      bank_connection_id: connectionId,
      origine: ORIGINE_OPEN_BANKING,
      stato_banca: TX_BOOKED,

      data,
      // Qui, e solo qui, il segno diventa `tipo` + importo positivo.
      tipo: importoFirmato < 0 ? 'uscita' : 'entrata',
      importo: round2(Math.abs(importoFirmato)),
      descrizione: String(tx.descrizione || 'Operazione bancaria').trim().slice(0, 500),

      merchant_suggerito: tx.merchantName ?? null,
      valuta: tx.valuta ?? valutaConto ?? null,
      // Il saldo riga per riga non ci serve: il saldo del conto arriva dal
      // provider come dato a sé (`balances`), che è più affidabile.
      balance: null,
    });
  });

  return { movimenti, scartate };
}

module.exports = { normalizzaTransazioni, impronta };
