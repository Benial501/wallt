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
const { Op } = require('sequelize');
const { Obiettivo, Investimento, Movimento } = require('../models');
const { FUSO_DEFAULT, oggiLocale, fineMese, sommaGiorni } = require('../utils/dateRome');
const { elencoMesi, classificaFinestra } = require('./finestraMesi.service');
const { calcolaPatrimonioNetto } = require('./financialSummary.service');
const { calcolaLiquidita } = require('./liquidita.service');
const { aggregaSpeseMesi, aggregaMedieSpeseFrequenti } = require('./spese.service');
const { calcolaEntrate } = require('./entrate.service');
const { calcolaMesiCopertura } = require('./fondoSicurezza.service');
const { riepilogo: riepilogoDebiti, calcolaPressioneDebitoria } = require('./debiti.service');
const { calcolaProgressoObiettivo } = require('./obiettiviStato.service');
const { descriviLiquidabilita } = require('./investimentiLiquidabilita.service');
const { STATI_RICORRENZA, normalizzaStatoRicorrenza, getRomeDateParts, valutaOccorrenza, periodoPerFrequenza } = require('./ricorrenti.service');

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
async function riepilogoRicorrenti(userId, referenceDate = new Date()) {
  const ricorrenti = await Movimento.findAll({
    where: { user_id: userId, ricorrente: true },
    attributes: ['id', 'descrizione', 'data', 'stato_ricorrenza', 'ricorrente_frequenza', 'ricorrente_giorno', 'ricorrente_mese', 'tipo', 'importo'],
  });

  const conteggi = Object.fromEntries(STATI_RICORRENZA.map((s) => [s, 0]));
  let commitments = 0;
  const oggi = getRomeDateParts(referenceDate);
  const termine = fineMese(oggi.date);
  const termineFlussi = sommaGiorni(oggi.date, 30);
  const addebiti = ricorrenti.length ? await Movimento.findAll({
    where: { user_id: userId, ricorrenza_origine_id: { [Op.in]: ricorrenti.map((r) => r.id) } },
    attributes: ['ricorrenza_origine_id', 'ricorrenza_periodo'],
  }) : [];
  const eseguiti = new Set(addebiti.map((m) => `${m.ricorrenza_origine_id}:${m.ricorrenza_periodo}`));
  // Un'occorrenza si annuncia una volta sola, il primo giorno in cui è
  // dovuta. Serve perché valutaOccorrenza apre una FINESTRA, non un istante:
  // una mensile è dovuta dal suo giorno in poi (recupero di un cron saltato,
  // vedi ricorrenti.service.js), quindi scorrendo i giorni la stessa scadenza
  // risulterebbe dovuta ogni giorno fino a fine mese. Per il cron è corretto
  // — l'indice unico lo limita a un addebito — ma qui produrrebbe una lista
  // di duplicati al posto del calendario.
  const emesse = new Set();
  const items = [];
  const cashFlowItems = [];
  ricorrenti.forEach((r) => {
    const stato = normalizzaStatoRicorrenza(r.stato_ricorrenza);
    conteggi[stato] = (conteggi[stato] || 0) + 1;
    if (stato === 'attiva' && (r.tipo === 'entrata' || r.tipo === 'uscita')) {
      for (let date = oggi.date; date <= termineFlussi; date = sommaGiorni(date, 1)) {
        const giorno = getRomeDateParts(new Date(`${date}T12:00:00Z`));
        const { dovuto, periodo } = valutaOccorrenza(r, giorno);
        const occurrenceKey = `${r.id}:${periodo}`;
        if (!dovuto || eseguiti.has(occurrenceKey)) continue;
        cashFlowItems.push({
          id: r.id,
          occurrenceKey,
          description: r.descrizione,
          amount: toNumber(r.importo),
          dueDate: date,
          direction: r.tipo,
          frequency: r.ricorrente_frequenza,
          reserved: r.tipo === 'uscita' && periodo === periodoPerFrequenza(r.ricorrente_frequenza, oggi),
        });
      }
    }
    if (stato === 'attiva' && r.tipo === 'uscita') {
      const fattore = FATTORE_MENSILE[r.ricorrente_frequenza];
      if (fattore) commitments += toNumber(r.importo) * fattore;
      // Stesse date e chiavi di deduplica del cron, senza inventare il
      // giorno 31 in un mese corto né includere addebiti già eseguiti.
      for (let date = oggi.date; date <= termine; date = sommaGiorni(date, 1)) {
        const giorno = getRomeDateParts(new Date(`${date}T12:00:00Z`));
        const { dovuto, periodo } = valutaOccorrenza(r, giorno);
        const occurrenceKey = `${r.id}:${periodo}`;
        if (!dovuto || eseguiti.has(occurrenceKey) || emesse.has(occurrenceKey)) continue;
        emesse.add(occurrenceKey);
        items.push({
          id: r.id, occurrenceKey, description: r.descrizione, amount: toNumber(r.importo),
          dueDate: date, frequency: r.ricorrente_frequenza,
          reserved: periodo === periodoPerFrequenza(r.ricorrente_frequenza, oggi),
        });
      }
    }
  });

  const riepilogo = {
    active: conteggi.attiva,
    paused: conteggi.sospesa,
    ended: conteggi.terminata,
    commitments: round2(commitments),
    cashFlowItems: cashFlowItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate)
      || a.occurrenceKey.localeCompare(b.occurrenceKey)),
  };
  if (items.length) riepilogo.items = items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return riepilogo;
}

/**
 * Obiettivi dell'utente (tutti, anche completati: uno stato deterministico
 * si applica anche a chi ha già raggiunto il traguardo), con stato e
 * priorità calcolati dal servizio di dominio. `priorita` è null quando
 * l'utente non l'ha ancora impostata o per un dato legacy/corrotto — mai
 * un valore inventato (vedi obiettiviStato.service.js).
 */
async function elencoObiettivi(userId, referenceDate) {
  const obiettivi = await Obiettivo.findAll({ where: { user_id: userId } });
  return obiettivi.map((o) => {
    const progresso = calcolaProgressoObiettivo(o, referenceDate);
    return {
      id: o.id,
      // `nome` serve a chi deve mostrare o spiegare una ripartizione per
      // obiettivo (Piano Smart): senza di esso il breakdown parlerebbe di
      // identificativi numerici. È l'etichetta scelta dall'utente, non un
      // dato calcolato, e non entra in nessuna metrica.
      nome: o.nome,
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
      period: null,
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
    // Il fondo ha una finestra propria (tre mesi civili completi) diversa da
    // `period.averageMonths`, che dipende da `historyMonths`: dichiararla
    // evita di far credere che i due numeri vengano dallo stesso periodo.
    period: {
      from: copertura.periodo.da,
      to: copertura.periodo.a,
      months: copertura.periodo.mesi,
    },
    requestedPeriod: copertura.periodo_richiesto ?? null,
    usedMonths: copertura.mesi_utilizzati ?? 0,
    limitedHistory: copertura.storico_limitato ?? false,
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
  const movimenti = await Movimento.findAll({
    where: { user_id: userId },
    order: [['data', 'ASC']],
    attributes: ['data', 'descrizione'],
  });
  const primo = movimenti.find((m) => m.descrizione !== 'Saldo iniziale');
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
  const mesiRichiesti = elencoMesi(meseCorrente, historyMonths);

  // Tre finestre distinte, una sola definizione (finestraMesi.service.js):
  // richiesta (gli N mesi chiesti), osservata (da dove comincia lo storico
  // reale dell'utente) e mesi per le medie (i soli mesi civili completi).
  // Prima di questa separazione entrate e spese trattavano il mese corrente
  // in modo diverso e lo storico spese conteneva zeri per mesi in cui
  // l'utente non aveva ancora un solo movimento.
  const primoMovimento = await primaDataMovimento(userId);
  const finestra = classificaFinestra({ mesiRichiesti, meseCorrente, primoMovimento });
  // Senza storico osservato non c'è nulla da chiedere alle entrate: si
  // interroga il solo mese corrente (che esiste sempre, parziale) invece di
  // generare N mesi di zeri che non sono storico.
  const finestraEntrate = finestra.osservata
    ? { da: finestra.osservata.da, a: finestra.osservata.a }
    : { da: meseCorrente, a: meseCorrente };

  const [
    patrimonioNetto,
    liquidita,
    spese,
    medieSpeseFrequenti,
    entrate,
    debiti,
    obiettivi,
    investimenti,
    ricorrenti,
    fondoSicurezza,
  ] = await Promise.all([
    calcolaPatrimonioNetto(userId),
    calcolaLiquidita(userId, { data: oggi }),
    aggregaSpeseMesi(userId, historyMonths, referenceDate, { primoMovimento }),
    aggregaMedieSpeseFrequenti(userId, referenceDate, primoMovimento),
    calcolaEntrate(userId, {
      da: finestraEntrate.da, a: finestraEntrate.a, now: referenceDate, primoMovimento,
    }),
    riepilogoDebiti(userId),
    elencoObiettivi(userId, referenceDate),
    riepilogoInvestimenti(userId),
    riepilogoRicorrenti(userId, referenceDate),
    riepilogoFondoSicurezza(userId, referenceDate),
  ]);

  // Un solo insieme di mesi per TUTTE le medie confrontabili: quello che
  // spese.service.js ha già classificato a partire dagli stessi input. Non si
  // ricalcola qui (sarebbe una seconda definizione della stessa finestra).
  const mesiMedie = spese.finestra.completi;
  const nMesiMedie = mesiMedie.length;
  const mediaSuMesiCompleti = (valorePerMese) => (nMesiMedie === 0 ? null
    : round2(mesiMedie.reduce((s, mese) => s + (valorePerMese(mese) || 0), 0) / nMesiMedie));

  const entratePerMese = new Map(entrate.mesi.map((m) => [m.mese, m]));
  const monthlyAverageIncome = mediaSuMesiCompleti((mese) => entratePerMese.get(mese)?.totale);
  // spese.media_mensile è già la media sui soli mesi completi, con la stessa
  // finestra: usarla evita di ricalcolare lo stesso numero in due modi.
  const monthlyAverageExpenses = spese.media_mensile;
  const monthlySavings = monthlyAverageIncome !== null && monthlyAverageExpenses !== null
    ? round2(monthlyAverageIncome - monthlyAverageExpenses) : null;
  const savingsRate = monthlySavings !== null && monthlyAverageIncome
    ? round2(monthlySavings / monthlyAverageIncome) : null;

  // Reddito "affidabile" per la pressione debitoria: solo la quota
  // ricorrente/prevedibile del reddito, mai il totale (che può includere
  // entrate occasionali non ripetibili — vedi entrate.service.js). Stessa
  // finestra delle altre medie: la quota ricorrente mese per mese arriva da
  // entrate.mesi[].quote, non dal totale dell'intera finestra.
  const redditoAffidabile = mediaSuMesiCompleti((mese) => entratePerMese.get(mese)?.quote?.ricorrente);
  const debtPressure = calcolaPressioneDebitoria(debiti.totalMonthlyPayments, redditoAffidabile);

  const nonClassificataNonTrascurabile = spese.byNecessity.totale > 0
    && (spese.byNecessity.non_classificata / spese.byNecessity.totale) > 0.01;

  const finestraMedie = {
    from: spese.finestra.mesiPerLeMedie.da,
    to: spese.finestra.mesiPerLeMedie.a,
    count: nMesiMedie,
  };
  // Le quattro classi di necessità condividono il denominatore delle spese
  // complessive: byNecessityMesiCompleti riconcilia con totale_mesi_completi,
  // che è esattamente media_mensile * nMesiMedie (vedi spese.service.js).
  const mediaClasse = (totale) => (nMesiMedie === 0 ? null : round2(totale / nMesiMedie));
  const perNecessita = spese.byNecessityMesiCompleti;

  return {
    period: {
      timezone: FUSO_DEFAULT,
      referenceDate: oggi,
      // `from`/`to`/`historyMonths` restano la finestra RICHIESTA, com'erano.
      from: `${mesiRichiesti[0]}-01`,
      to: oggi,
      historyMonths,
      // Le tre finestre, distinte ed esplicite (vedi finestraMesi.service.js).
      requested: { from: spese.finestra.richiesta.da, to: spese.finestra.richiesta.a },
      observed: spese.finestra.osservata
        ? { from: spese.finestra.osservata.da, to: spese.finestra.osservata.a } : null,
      averageMonths: finestraMedie,
    },

    dataQuality: {
      // Tutti i conteggi partono dalla finestra OSSERVATA: un mese di
      // calendario prima del primo movimento dell'utente non è "storico a
      // zero", semplicemente non è storico.
      firstMovementDate: primoMovimento,
      historyMonthsAvailable: spese.finestra.osservati.length,
      completeMonths: nMesiMedie,
      incompleteMonths: spese.finestra.osservati.length - nMesiMedie,
      firstObservedMonthPartial: spese.finestra.primoMeseParziale,
      missingIncomeData: primoMovimento === null || (entrate.totale === 0 && entrate.stabilita === 'nessuna_entrata') || entrate.totale === 0,
      missingExpenseData: primoMovimento === null || (nMesiMedie === 0 && spese.totale === 0),
      missingClassificationData: nonClassificataNonTrascurabile,
      hasSufficientHistory: nMesiMedie >= 1 && entrate.mesi_stabilita >= 3
        && entrate.stabilita !== 'insufficiente',
      // LIMITE DICHIARATO: WALLT non ha collegamento bancario, quindi la
      // completezza delle registrazioni di un mese non è osservabile. Un mese
      // "completo" qui significa "mese civile chiuso, con almeno un indizio
      // che le registrazioni ne coprano l'inizio", non "tutte le spese di
      // quel mese sono state registrate".
      registrationCompleteness: 'non_verificabile',
    },

    income: {
      currentMonth: entratePerMese.get(meseCorrente)?.totale ?? 0,
      monthlyAverage: monthlyAverageIncome,
      averageMonths: nMesiMedie,
      recurring: entrate.quote.ricorrente,
      recurringMonthlyAverage: redditoAffidabile,
      oneOff: entrate.quote.occasionale,
      unclassified: entrate.quote.sconosciuta,
      stability: entrate.stabilita,
      stabilityMonths: entrate.mesi_stabilita,
      stabilityPeriod: entrate.periodo_stabilita,
      // Senza finestra osservata non c'è storico: l'unico mese interrogato
      // (quello corrente) non è storico dell'utente, è solo il mese in cui si
      // trova. Esporlo come `history` sarebbe uno zero inventato.
      history: spese.finestra.osservata ? entrate.mesi : [],
    },

    expenses: {
      currentMonth: spese.mese_corrente?.totale ?? 0,
      variableCurrentMonth: spese.spese_non_ricorrenti_mese_corrente,
      monthlyAverage: monthlyAverageExpenses,
      averageMonths: nMesiMedie,
      // Totale sui soli mesi completi: è il denominatore con cui
      // `monthlyAverage` e le quattro classi di necessità riconciliano.
      totalCompleteMonths: spese.totale_mesi_completi,
      // Totale dell'intera finestra osservata, mese in corso compreso: NON
      // divisibile per un numero di mesi (mescola mesi chiusi e uno in corso).
      totalObserved: spese.totale,
      // Le quattro classi hanno lo STESSO denominatore delle spese
      // complessive: stessi mesi completi, stesso conteggio. `period` lo
      // dichiara nella risposta, così chi legge non deve indovinarlo.
      byNecessity: {
        period: finestraMedie,
        essential: {
          total: perNecessita.essenziale,
          monthlyAverage: mediaClasse(perNecessita.essenziale),
        },
        semiEssential: {
          total: perNecessita.semi_essenziale,
          monthlyAverage: mediaClasse(perNecessita.semi_essenziale),
        },
        discretionary: {
          total: perNecessita.discrezionale,
          monthlyAverage: mediaClasse(perNecessita.discrezionale),
        },
        unclassified: {
          total: perNecessita.non_classificata,
          monthlyAverage: mediaClasse(perNecessita.non_classificata),
        },
        total: perNecessita.totale,
      },
      frequentAverages: medieSpeseFrequenti,
      history: spese.storico,
    },

    cashFlow: {
      monthlyAverageIncome,
      monthlyAverageExpenses,
      monthlySavings,
      savingsRate,
      averageMonths: nMesiMedie,
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
      // Oggetti semplici (vedi debiti.service.js#descriviDebito): importi
      // numerici, identificativi conservati, nessun metadato interno.
      items: debiti.itemsNormalizzati,
      totalOutstanding: debiti.totalOutstanding,
      totalMonthlyPayments: debiti.totalMonthlyPayments,
      // La rata mensile equivalente è una METRICA, non un impegno accertato:
      // `liquidity.commitments` contiene solo le ricorrenze attive che il
      // cron addebiterà (liquidita.service.js), e `totalMonthlyPayments` non
      // vi viene mai sommato. Senza un collegamento debito↔ricorrenza nello
      // schema, sommarli produrrebbe o una doppia sottrazione (se la rata è
      // già registrata come ricorrente) o un totale inventato (se non lo è).
      monthlyPayments: {
        total: debiti.totalMonthlyPayments,
        includedInLiquidityCommitments: false,
        reconciliation: debiti.riconciliazioneRate,
      },
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

module.exports = { getFinancialContext, riepilogoRicorrenti };
