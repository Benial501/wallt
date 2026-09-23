const { Debito } = require('../models');

const round2 = (val) => Math.round(val * 100) / 100;
const toNumber = (val) => parseFloat(val) || 0;

/**
 * Fattore per convertire una rata alla sua frequenza in un importo mensile
 * equivalente, così da poter sommare rate di frequenza diversa in un unico
 * totale. `unica` è un pagamento singolo (non ricorrente per definizione):
 * non ha un "equivalente mensile" — non entra in totalMonthlyPayments.
 */
const FATTORE_MENSILE = {
  mensile: 1,
  settimanale: 52 / 12,
  annuale: 1 / 12,
};

const rataMensileEquivalente = (debito) => {
  const rata = toNumber(debito.rata_periodica);
  if (!rata) return 0;
  const fattore = FATTORE_MENSILE[debito.frequenza];
  return fattore === undefined ? 0 : rata * fattore;
};

/**
 * Elenco utente + aggregazioni: residuo totale, rate mensili totali (rate di
 * frequenza diversa convertite a un mensile equivalente, vedi sopra),
 * numero di debiti attivi. Sola lettura, nessuna valutazione creditizia.
 */
async function riepilogo(userId) {
  const items = await Debito.findAll({
    where: { user_id: userId, attivo: true },
    order: [['createdAt', 'DESC']],
  });

  const totalOutstanding = round2(items.reduce((s, d) => s + toNumber(d.saldo_residuo), 0));
  const totalMonthlyPayments = round2(items.reduce((s, d) => s + rataMensileEquivalente(d), 0));

  return {
    items, totalOutstanding, totalMonthlyPayments, activeCount: items.length,
  };
}

/**
 * debtPressure = totalMonthlyPayments / reliableMonthlyIncome.
 *
 * `reliableMonthlyIncome` è un input esplicito, non calcolato qui: è la
 * quota di reddito ricorrente/prevedibile (non tutto il reddito, che può
 * includere entrate occasionali non ripetibili — vedi il servizio entrate).
 * Nessuna valutazione creditizia: solo un rapporto, il significato lo dà chi
 * lo mostra.
 *
 * Ritorna `null` (non 0, non Infinity) quando il reddito affidabile è
 * assente, sconosciuto, zero o negativo: un rapporto su un denominatore non
 * valido non è un numero, è un dato mancante.
 */
const calcolaPressioneDebitoria = (totalMonthlyPayments, reliableMonthlyIncome) => {
  if (reliableMonthlyIncome === null || reliableMonthlyIncome === undefined) return null;
  if (!Number.isFinite(reliableMonthlyIncome) || reliableMonthlyIncome <= 0) return null;
  if (!Number.isFinite(totalMonthlyPayments)) return null;
  // Precisione al millesimo: è un rapporto, non un importo in euro (round2
  // qui appiattirebbe una pressione dell'8% e del 12% entrambe a "0.1").
  return Math.round((totalMonthlyPayments / reliableMonthlyIncome) * 1000) / 1000;
};

module.exports = { riepilogo, calcolaPressioneDebitoria, rataMensileEquivalente };
