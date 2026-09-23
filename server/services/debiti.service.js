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
 * Vista di dominio di un debito: oggetto semplice, campi espliciti, importi
 * già numeri (le colonne DECIMAL arrivano da pg come stringa) e nessun
 * metadato interno — `user_id` in particolare non esce mai da qui, perché a
 * chi legge un contesto già filtrato per utente non serve, e propagarlo
 * significa solo esporre una chiave interna.
 *
 * `installment` è la rata alla sua frequenza reale; `monthlyEquivalent` è la
 * conversione a mensile (vedi rataMensileEquivalente). Sono due grandezze
 * diverse e restano separate: la seconda è una metrica di confronto, non un
 * pagamento che qualcuno ha davvero programmato in quel mese.
 */
const descriviDebito = (debito) => ({
  id: debito.id,
  name: debito.nome,
  type: debito.tipo,
  outstanding: round2(toNumber(debito.saldo_residuo)),
  installment: debito.rata_periodica === null || debito.rata_periodica === undefined
    ? null : round2(toNumber(debito.rata_periodica)),
  frequency: debito.frequenza ?? null,
  monthlyEquivalent: round2(rataMensileEquivalente(debito)),
  interestRate: debito.tasso_interesse === null || debito.tasso_interesse === undefined
    ? null : toNumber(debito.tasso_interesse),
  apr: debito.taeg === null || debito.taeg === undefined ? null : toNumber(debito.taeg),
  nextDueDate: debito.prossima_scadenza ? String(debito.prossima_scadenza).slice(0, 10) : null,
  endDate: debito.data_fine ? String(debito.data_fine).slice(0, 10) : null,
  accountId: debito.conto_id ?? null,
});

/**
 * Stato di riconciliazione fra le rate teoriche dei debiti e gli impegni
 * realmente accertati (le ricorrenze che il cron addebiterà).
 *
 * Oggi lo schema NON ha alcun collegamento fra `debiti` e `movimenti`: la
 * tabella `debiti` ha solo `conto_id`, nessun `movimento_id` né
 * `ricorrenza_origine_id`, e `movimenti` non ha `debito_id`. Quindi il numero
 * di rate collegate a una ricorrenza è 0 per costruzione, non per mancanza di
 * dati dell'utente. Dedurre un collegamento confrontando importo,
 * descrizione o categoria sarebbe una congettura: due uscite da 650 € al mese
 * possono essere lo stesso mutuo o due obblighi distinti, e sbagliare
 * significa o contare due volte lo stesso euro o perderne uno.
 *
 * Conseguenza dichiarata: `totalMonthlyPayments` NON è un totale certo delle
 * obbligazioni mensili, e non va sommato agli impegni della liquidità.
 */
const statoRiconciliazioneRate = (items) => {
  const conRata = items.filter((d) => toNumber(d.rata_periodica) > 0);
  return {
    status: items.length === 0 ? 'nessun_debito' : 'non_disponibile',
    linkedToRecurring: 0,
    unlinked: conRata.length,
    note: items.length === 0
      ? 'Nessun debito registrato: non c\'è nulla da riconciliare.'
      : 'Lo schema non collega un debito a una ricorrenza: le rate restano '
        + 'teoriche e non vengono sottratte dalla liquidità.',
  };
};

/**
 * Elenco utente + aggregazioni: residuo totale, rate mensili totali (rate di
 * frequenza diversa convertite a un mensile equivalente, vedi sopra),
 * numero di debiti attivi. Sola lettura, nessuna valutazione creditizia.
 *
 * `items` resta l'istanza Sequelize (la usa la rotta HTTP dei debiti, che
 * serializza a suo modo); chi vuole la vista normalizzata usa
 * `descriviDebito`. `itemsNormalizzati` la espone già applicata, per non
 * costringere ogni chiamante a rifare il map.
 */
async function riepilogo(userId) {
  const items = await Debito.findAll({
    where: { user_id: userId, attivo: true },
    order: [['createdAt', 'DESC']],
  });

  const totalOutstanding = round2(items.reduce((s, d) => s + toNumber(d.saldo_residuo), 0));
  const totalMonthlyPayments = round2(items.reduce((s, d) => s + rataMensileEquivalente(d), 0));

  return {
    items,
    itemsNormalizzati: items.map(descriviDebito),
    totalOutstanding,
    totalMonthlyPayments,
    activeCount: items.length,
    riconciliazioneRate: statoRiconciliazioneRate(items),
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

module.exports = {
  riepilogo, calcolaPressioneDebitoria, rataMensileEquivalente,
  descriviDebito, statoRiconciliazioneRate,
};
