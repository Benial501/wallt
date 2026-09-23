/**
 * getFinancialContext(userId, options) — l'unico punto che compone i servizi
 * di dominio finanziario in una lettura coerente e deterministica dello
 * stato di un utente. Non fa query proprie sui dati che i servizi di
 * dominio già espongono, non decide allocazioni, non genera testo, non
 * dipende da Express (nessun req/res). Preparatorio per il Piano Smart, che
 * NON fa parte di questo servizio.
 *
 * Ogni sezione richiama il servizio di dominio che possiede quel calcolo
 * (vedi CLAUDE.md Regola 20 per patrimonio/liquidità/essenzialità/fondo
 * sicurezza, e i corrispettivi per entrate/spese/obiettivi/debiti/
 * investimenti/ricorrenti aggiunti in questo lavoro): questo file compone,
 * non ricalcola.
 */
const { Obiettivo, Investimento, Movimento } = require('../models');
const {
  FUSO_DEFAULT, oggiLocale, sommaMesi,
} = require('../utils/dateRome');
const { calcolaPatrimonioNetto } = require('./financialSummary.service');
const { calcolaLiquidita } = require('./liquidita.service');
const { aggregaSpeseMesi } = require('./spese.service');
const { calcolaEntrate } = require('./entrate.service');
const { calcolaMesiCopertura } = require('./fondoSicurezza.service');
const { riepilogo: riepilogoDebiti, calcolaPressioneDebitoria } = require('./debiti.service');
const { calcolaProgressoObiettivo } = require('./obiettiviStato.service');
const { descriviLiquidabilita } = require('./investimentiLiquidabilita.service');
const { STATI_RICORRENZA } = require('./ricorrenti.service');

const round2 = (v) => Math.round(v * 100) / 100;
const toNumber = (v) => parseFloat(v) || 0;

/** Fattore mensile equivalente per una ricorrenza, stesso criterio di
 * debiti.service.js#rataMensileEquivalente: 'unica' non esiste per le
 * ricorrenti (FREQUENZE_SUPPORTATE non la include), quindi non serve qui. */
const FATTORE_MENSILE = { mensile: 1, settimanale: 52 / 12, annuale: 1 / 12 };

/**
 * Impegni ricorrenti raggruppati per stato + impegno mensile equivalente
 * delle sole ricorrenti attive (le sospese/terminate non generano movimenti
 * e non contano come impegno futuro — CLAUDE.md, Regola ricorrenti §12).
 */
async function riepilogoRicorrenti(userId) {
  const ricorrenti = await Movimento.findAll({
    where: { user_id: userId, ricorrente: true },
    attributes: ['stato_ricorrenza', 'ricorrente_frequenza', 'tipo', 'importo'],
  });

  const conteggi = Object.fromEntries(STATI_RICORRENZA.map((s) => [s, 0]));
  let commitments = 0;
  ricorrenti.forEach((r) => {
    const stato = STATI_RICORRENZA.includes(r.stato_ricorrenza) ? r.stato_ricorrenza : 'attiva';
    conteggi[stato] = (conteggi[stato] || 0) + 1;
    if (stato === 'attiva' && r.tipo === 'uscita') {
      const fattore = FATTORE_MENSILE[r.ricorrente_frequenza];
      if (fattore) commitments += toNumber(r.importo) * fattore;
    }
  });

  return {
    active: conteggi.attiva,
    paused: conteggi.sospesa,
    ended: conteggi.terminata,
    commitments: round2(commitments),
  };
}

/**
 * Obiettivi dell'utente (tutti, anche completati: uno stato deterministico
 * si applica anche a chi ha già raggiunto il traguardo), con lo stato
 * calcolato dal servizio di dominio. `priority` è null: il modello
 * Obiettivo non ha oggi un campo priorità (non introdotto in questo lavoro
 * perché nessun consumer lo richiede ancora) — mai un valore inventato.
 */
async function elencoObiettivi(userId, referenceDate) {
  const obiettivi = await Obiettivo.findAll({ where: { user_id: userId } });
  return obiettivi.map((o) => {
    const progresso = calcolaProgressoObiettivo(o, referenceDate);
    return {
      id: o.id,
      priority: null,
      ...progresso,
    };
  });
}

/**
 * Investimenti attivi con liquidabilità/tempi (servizio di dominio) più
 * l'aggregazione per liquidabilità, usata anche da liquidity.allocatable in
 * una futura estensione: qui esposta com'è, senza sommarla al patrimonio
 * (patrimonio ≠ liquidità allocabile, mai risommare campi già presenti
 * altrove — vedi liquidity più sotto).
 */
async function riepilogoInvestimenti(userId) {
  const investimenti = await Investimento.findAll({ where: { user_id: userId, attivo: true } });
  const items = investimenti.map((i) => ({ id: i.id, nome: i.nome_piattaforma, ...descriviLiquidabilita(i) }));

  const totals = { liquidabile: 0, vincolato: 0, sconosciuto: 0 };
  items.forEach((i) => { totals[i.liquidabilita] += i.valore ?? 0; });

  return {
    totalValue: round2(items.reduce((s, i) => s + (i.valore ?? 0), 0)),
    liquidValue: round2(totals.liquidabile),
    nonLiquidValue: round2(totals.vincolato),
    unknownLiquidityValue: round2(totals.sconosciuto),
    items,
  };
}

/**
 * Fondo di sicurezza: cerca l'obiettivo tipo_obiettivo='fondo_sicurezza'
 * dell'utente (al più uno per costruzione della UI, ma la query non lo
 * presume: prende il primo attivo). Nessun fondo definito è uno stato
 * esplicito ('assente'), non un errore né uno zero.
 */
async function riepilogoFondoSicurezza(userId, referenceDate) {
  const fondo = await Obiettivo.findOne({
    where: { user_id: userId, tipo_obiettivo: 'fondo_sicurezza' },
    order: [['createdAt', 'ASC']],
  });
  if (!fondo) {
    return {
      essentialMonthlyExpenses: null,
      current: null,
      target: null,
      targetMonths: null,
      coverageMonths: null,
      missingAmount: null,
      status: 'assente',
      classificazione_incompleta: null,
    };
  }

  const copertura = await calcolaMesiCopertura({ userId, obiettivo: fondo, riferimento: referenceDate });
  const target = toNumber(fondo.importo_target);
  const current = toNumber(fondo.importo_attuale);
  return {
    essentialMonthlyExpenses: copertura.spese_essenziali_mensili,
    current,
    target,
    targetMonths: copertura.spese_essenziali_mensili
      ? round2(target / copertura.spese_essenziali_mensili) : null,
    coverageMonths: copertura.mesi_copertura,
    missingAmount: round2(Math.max(target - current, 0)),
    status: copertura.stato,
    classificazione_incompleta: copertura.classificazione_incompleta ?? null,
  };
}

/**
 * Prima data movimento dell'utente (qualsiasi tipo), o null se non ne ha
 * mai registrato uno. Serve a non confondere "mese di calendario passato
 * senza spese" (zero osservato, un dato valido) con "mese prima che
 * l'utente avesse un solo movimento" (storico che non può esistere): senza
 * questo controllo, un utente appena registrato con zero movimenti
 * risulterebbe con 11 "mesi completi" a zero e uno storico apparentemente
 * sufficiente.
 */
async function primaDataMovimento(userId) {
  const primo = await Movimento.findOne({
    where: { user_id: userId },
    order: [['data', 'ASC']],
    attributes: ['data'],
  });
  return primo ? String(primo.data).slice(0, 10) : null;
}

/**
 * Contesto finanziario completo di un utente in un unico oggetto
 * deterministico. `options.referenceDate` è iniettabile per test
 * riproducibili (default: adesso). `options.historyMonths` (default 12) è
 * l'ampiezza dello storico mensile di entrate/spese.
 *
 * Non lancia mai per "dati assenti": un utente nuovo, senza conti né
 * movimenti, riceve comunque un oggetto completo con gli stati/valori
 * espliciti di "nessun dato" propagati dai servizi di dominio (vedi il loro
 * commento su zero osservato vs dato mancante vs storico insufficiente).
 */
async function getFinancialContext(userId, options = {}) {
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const historyMonths = Number.isInteger(options.historyMonths) && options.historyMonths > 0
    ? options.historyMonths : 12;
  const oggi = oggiLocale(FUSO_DEFAULT, referenceDate);
  const meseCorrente = oggi.slice(0, 7);
  const meseFinestra = sommaMesi(`${meseCorrente}-01`, -(historyMonths - 1)).slice(0, 7);

  // Prima di interrogare spese/entrate, sappiamo da dove comincia lo storico
  // reale dell'utente: un mese di calendario prima del suo primo movimento
  // non è "storico a zero", semplicemente non esiste per lui. calcolaEntrate
  // riceve direttamente la finestra clippata; le spese (storico completo,
  // utile per expenses.history) si clippano dopo per la sola media.
  const primoMovimento = await primaDataMovimento(userId);
  const primoMese = primoMovimento ? primoMovimento.slice(0, 7) : null;
  const daEntrate = primoMese && primoMese > meseFinestra ? primoMese : meseFinestra;

  const [
    patrimonioNetto,
    liquidita,
    spese,
    entrate,
    debiti,
    obiettivi,
    investimenti,
    ricorrenti,
    fondoSicurezza,
  ] = await Promise.all([
    calcolaPatrimonioNetto(userId),
    calcolaLiquidita(userId, { data: oggi }),
    aggregaSpeseMesi(userId, historyMonths, referenceDate),
    calcolaEntrate(userId, { da: daEntrate, a: meseCorrente, now: referenceDate }),
    riepilogoDebiti(userId),
    elencoObiettivi(userId, referenceDate),
    riepilogoInvestimenti(userId),
    riepilogoRicorrenti(userId),
    riepilogoFondoSicurezza(userId, referenceDate),
  ]);

  const meseCompletiReali = primoMese
    ? spese.storico.filter((m) => !m.parziale && m.periodo >= primoMese).length
    : 0;
  const meseCompletiRealiTotale = primoMese
    ? round2(spese.storico
      .filter((m) => !m.parziale && m.periodo >= primoMese)
      .reduce((s, m) => s + m.totale, 0))
    : 0;

  const monthlyAverageIncome = entrate.stabilita === 'insufficiente' ? null : entrate.media_mensile;
  const monthlyAverageExpenses = meseCompletiReali > 0
    ? round2(meseCompletiRealiTotale / meseCompletiReali) : null;
  const monthlySavings = monthlyAverageIncome !== null && monthlyAverageExpenses !== null
    ? round2(monthlyAverageIncome - monthlyAverageExpenses) : null;
  const savingsRate = monthlySavings !== null && monthlyAverageIncome
    ? round2(monthlySavings / monthlyAverageIncome) : null;

  // Reddito "affidabile" per la pressione debitoria: solo la quota
  // ricorrente/prevedibile del reddito, mai il totale (che può includere
  // entrate occasionali non ripetibili — vedi entrate.service.js).
  const redditoAffidabile = entrate.stabilita === 'insufficiente'
    ? null : round2(entrate.quote.ricorrente / Math.max(entrate.mesi.length, 1));
  const debtPressure = calcolaPressioneDebitoria(debiti.totalMonthlyPayments, redditoAffidabile);

  const nonClassificataNonTrascurabile = spese.byNecessity.totale > 0
    && (spese.byNecessity.non_classificata / spese.byNecessity.totale) > 0.01;

  return {
    period: {
      timezone: FUSO_DEFAULT,
      referenceDate: oggi,
      from: `${meseFinestra}-01`,
      to: oggi,
      historyMonths,
    },

    dataQuality: {
      // historyMonthsAvailable/completeMonths sono clippati a partire dal
      // primo movimento mai registrato: un mese di calendario prima che
      // l'utente esistesse non è "storico a zero", semplicemente non è
      // storico (vedi primaDataMovimento sopra).
      historyMonthsAvailable: primoMese
        ? spese.storico.filter((m) => m.periodo >= primoMese).length : 0,
      completeMonths: meseCompletiReali,
      incompleteMonths: (primoMese
        ? spese.storico.filter((m) => m.periodo >= primoMese).length : 0) - meseCompletiReali,
      missingIncomeData: primoMovimento === null || (entrate.totale === 0 && entrate.stabilita === 'nessuna_entrata'),
      missingExpenseData: primoMovimento === null || (meseCompletiReali === 0 && spese.totale === 0),
      missingClassificationData: nonClassificataNonTrascurabile,
      hasSufficientHistory: meseCompletiReali >= 1 && entrate.stabilita !== 'insufficiente',
    },

    income: {
      currentMonth: entrate.mesi[entrate.mesi.length - 1]?.totale ?? 0,
      monthlyAverage: monthlyAverageIncome,
      recurring: entrate.quote.ricorrente,
      oneOff: entrate.quote.occasionale,
      unclassified: entrate.quote.sconosciuta,
      stability: entrate.stabilita,
      history: entrate.mesi,
    },

    expenses: {
      currentMonth: spese.storico[spese.storico.length - 1]?.totale ?? 0,
      monthlyAverage: monthlyAverageExpenses,
      // monthlyAverage per gruppo resta null: aggregaSpeseMesi non tiene
      // ancora una scomposizione per necessità mese per mese (solo il
      // totale dell'intera finestra), quindi non c'è modo di dividerla per
      // i soli mesi completi senza mescolare grandezze diverse (il totale
      // qui sotto include anche il mese corrente parziale). Un null
      // dichiarato è preferibile a una media calcolata su una base diversa
      // da quella di `monthlyAverage` sopra.
      byNecessity: {
        essential: { total: spese.byNecessity.essenziale, monthlyAverage: null },
        semiEssential: { total: spese.byNecessity.semi_essenziale, monthlyAverage: null },
        discretionary: { total: spese.byNecessity.discrezionale, monthlyAverage: null },
        unclassified: { total: spese.byNecessity.non_classificata, monthlyAverage: null },
      },
      history: spese.storico,
    },

    cashFlow: {
      monthlyAverageIncome,
      monthlyAverageExpenses,
      monthlySavings,
      savingsRate,
    },

    liquidity: {
      total: liquidita.saldo_conti,
      ordinary: liquidita.saldo_ordinario,
      specialAccounts: liquidita.saldo_conti_speciali,
      allocated: liquidita.liquidita_allocata,
      commitments: liquidita.impegni_pertinenti,
      free: liquidita.liquidita_libera,
      allocatable: liquidita.liquidita_allocabile,
    },

    emergencyFund: fondoSicurezza,

    goals: obiettivi,

    debts: {
      items: debiti.items,
      totalOutstanding: debiti.totalOutstanding,
      totalMonthlyPayments: debiti.totalMonthlyPayments,
      debtPressure,
    },

    investments: investimenti,

    recurring: ricorrenti,

    netWorth: {
      assets: patrimonioNetto.patrimonio_totale,
      liabilities: patrimonioNetto.passivita_totale,
      total: patrimonioNetto.patrimonio_netto,
    },
  };
}

module.exports = { getFinancialContext };
