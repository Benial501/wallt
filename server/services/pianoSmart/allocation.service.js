/**
 * Allocation Engine di Piano Smart — deterministico, in centesimi interi,
 * senza dipendenze da Sequelize o Express.
 *
 * Riceve un FinancialContext e un input, restituisce la ripartizione fra le
 * cinque categorie più i reason code che la giustificano. Non fa query, non
 * salva niente, non muove denaro.
 *
 * La catena, nell'ordine in cui i passi si applicano:
 *
 *   1. capitale allocabile = max(entrata - obbligatorie, 0)
 *   2. pesi base (config.PESI_BASE)
 *   3. azzeramento di eleggibilità (goals senza obiettivi)
 *   4. modificatori moltiplicativi, uno per driver del profilo
 *   5. normalizzazione in quote
 *   6. banda della libertà
 *   7. ripartizione al resto maggiore in centesimi
 *   8. cap (goals, safety) + redistribuzione del residuo
 *   9. breakdown per obiettivo
 *
 * Perché moltiplicativi e non additivi: i driver devono COMPORSI. Emergenza
 * critica insieme a cash flow negativo deve essere più prudente di ciascuna
 * delle due da sola, e con i pesi additivi l'effetto combinato dipenderebbe
 * dall'ordine in cui si sommano.
 *
 * Perché la ripartizione al resto maggiore e non cinque arrotondamenti
 * indipendenti: l'invariante è `somma == capitale allocabile` ESATTA. Cinque
 * `Math.round` sbagliano la somma di uno o due centesimi quasi sempre.
 */
const {
  ENGINE_VERSION, CATEGORIE, PESI_BASE, SOGLIE, MODIFICATORI, LIBERTA,
  PESO_PRIORITA, PESO_URGENZA, MAX_ITERAZIONI_REDISTRIBUZIONE,
  DESTINATARI_ULTIMA_ISTANZA,
} = require('./config');
const { ripartisciCentesimi, percentuale } = require('./money');
const { buildProfile, obiettivoEleggibile, urgenzaObiettivo } = require('./profile.service');
const { ordinaReasonCodes } = require('./reasonCodes');
const { assertInvariantiMotore } = require('./validation.service');

const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);
/** Euro (dai servizi di dominio) → centesimi, troncando verso il basso.
 * Tronca e non arrotonda perché serve per i CAP: un cap arrotondato per
 * eccesso permetterebbe di superare di un centesimo il gap reale. */
const euroACentesimi = (euro) => (numeroValido(euro) && euro > 0 ? Math.floor(euro * 100) : 0);

const centesimiInteri = (valore, nome) => {
  if (!Number.isInteger(valore) || valore < 0) {
    throw new Error(`${nome} deve essere un numero intero di centesimi non negativo`);
  }
  return valore;
};

/**
 * Ripartisce `totaleCent` fra `chiavi` in proporzione ai pesi, rispettando i
 * cap, e redistribuisce il residuo fra le chiavi ancora libere.
 *
 * L'algoritmo fissa le chiavi che sforano al loro cap e ricalcola sulle
 * restanti, finché nessuna sfora. Termina sempre: ogni iterazione fissa almeno
 * una chiave e le chiavi sono finite. `MAX_ITERAZIONI_REDISTRIBUZIONE` è un
 * guardrail contro un loop, non una previsione — con due soli cap (goals e
 * safety) due passaggi bastano.
 *
 * `cap[chiave] === null | undefined` significa "nessun limite".
 *
 * Il caso in cui TUTTE le chiavi sono fissate con residuo da assegnare non è
 * raggiungibile con la configurazione attuale (needs, future e freedom non
 * hanno cap), ma è gestito: il residuo va al primo destinatario di ultima
 * istanza e viene segnalato. Perdere centesimi romperebbe l'invariante della
 * somma, che è un danno peggiore di un cap superato.
 */
const ripartisciConCap = (pesi, totaleCent, cap, ordine) => {
  const fissati = {};
  const capRaggiunti = [];
  let tutteFissate = false;

  for (let iterazione = 0; iterazione < MAX_ITERAZIONI_REDISTRIBUZIONE; iterazione += 1) {
    const liberi = ordine.filter((k) => !(k in fissati));
    const giaFissato = Object.values(fissati).reduce((s, v) => s + v, 0);
    const residuo = totaleCent - giaFissato;

    if (liberi.length === 0) {
      tutteFissate = true;
      break;
    }

    const pesiLiberi = Object.fromEntries(liberi.map((k) => [k, pesi[k]]));
    const assegnazione = ripartisciCentesimi(pesiLiberi, residuo, liberi);

    const sforati = liberi.filter((k) => {
      const limite = cap[k];
      return numeroValido(limite) && assegnazione[k] > limite;
    });

    if (sforati.length === 0) {
      const esito = { ...fissati, ...assegnazione };
      return { allocazione: esito, capRaggiunti };
    }

    sforati.forEach((k) => {
      fissati[k] = cap[k];
      if (!capRaggiunti.includes(k)) capRaggiunti.push(k);
    });
  }

  // Uscita dal loop senza che tutte le chiavi fossero fissate: significa che
  // il guardrail sulle iterazioni ha scattato, cioè che qualcuno ha aggiunto
  // cap oltre a goals e safety senza rivedere questo limite. Proseguire
  // produrrebbe una ripartizione in cui le chiavi ancora libere prendono zero
  // e il residuo finisce tutto su una categoria: un risultato plausibile
  // all'occhio e sbagliato. Meglio fallire qui, dove la causa è visibile.
  if (!tutteFissate) {
    throw new Error(
      `Redistribuzione non conclusa in ${MAX_ITERAZIONI_REDISTRIBUZIONE} iterazioni: `
      + 'più cap di quanti il limite preveda (vedi MAX_ITERAZIONI_REDISTRIBUZIONE)',
    );
  }

  // Tutte le chiavi sono al loro cap e resta del capitale da assegnare. Con la
  // configurazione attuale non è raggiungibile (needs, future e freedom non
  // hanno cap), ma perdere centesimi romperebbe l'invariante della somma, che
  // è un danno peggiore di un cap superato: il residuo va al primo
  // destinatario di ultima istanza.
  const esito = {};
  ordine.forEach((k) => { esito[k] = fissati[k] ?? 0; });
  const assegnato = ordine.reduce((s, k) => s + esito[k], 0);
  const residuo = totaleCent - assegnato;
  if (residuo > 0) {
    const destinatario = DESTINATARI_ULTIMA_ISTANZA.find((k) => ordine.includes(k)) ?? ordine[0];
    esito[destinatario] += residuo;
  }
  return { allocazione: esito, capRaggiunti };
};

/**
 * Applica i fattori di un driver ai pesi. Un driver la cui fascia è `null` o
 * che è dichiarato ignoto-senza-classificazione non applica NIENTE: è la
 * regola per cui un dato mancante non diventa un neutro dichiarato.
 *
 * `incomeStability` è l'eccezione documentata: la sua fascia MEDIUM esiste
 * anche quando la stabilità non è dimostrabile, perché "non posso dimostrarla"
 * è un'affermazione di `entrate.service.js`, non un dato assente. Il suo
 * modificatore (prudente) si applica.
 */
const applicaModificatore = (pesi, tabella, fascia, tracciato, nomeDriver) => {
  if (fascia === null || fascia === undefined) return;
  const fattori = tabella[fascia];
  if (!fattori) return;
  const applicati = {};
  Object.entries(fattori).forEach(([categoria, fattore]) => {
    if (!CATEGORIE.includes(categoria)) return;
    pesi[categoria] *= fattore;
    applicati[categoria] = fattore;
  });
  if (Object.keys(applicati).length > 0) {
    tracciato.push({ driver: nomeDriver, fascia, fattori: applicati });
  }
};

/**
 * Banda della libertà.
 *
 * `freedom` non è un residuo: è ciò che rende un piano sostenibile. Un piano
 * che non lascia niente all'utente viene abbandonato, e un piano abbandonato
 * non protegge nessuno. Per questo ha un minimo — che si comprime, ma non
 * sparisce — quando la situazione lo impone.
 *
 * La banda vincola la ripartizione INIZIALE. La redistribuzione dei cap può
 * poi portare `freedom` oltre il massimo (se safety e goals sono entrambe
 * sature il denaro deve andare da qualche parte): è deliberato, la banda non è
 * un vincolo assoluto.
 */
const regimeCompresso = (profile) => profile.savingsCapacity === 'NEGATIVE'
  || profile.emergencyCoverage === 'CRITICAL'
  || profile.debtPressure === 'HIGH'
  || profile.expensePressure === 'HIGH';

const applicaBandaLiberta = (quote, profile) => {
  const minimo = regimeCompresso(profile) ? LIBERTA.minCompressa : LIBERTA.minNormale;
  const massimo = LIBERTA.maxNormale;
  const attuale = quote.freedom;
  const obiettivo = Math.min(Math.max(attuale, minimo), massimo);
  if (obiettivo === attuale) return { quote, banda: { minimo, massimo, applicata: false } };

  const altre = CATEGORIE.filter((c) => c !== 'freedom');
  const sommaAltre = altre.reduce((s, c) => s + quote[c], 0);
  const nuove = { freedom: obiettivo };
  if (sommaAltre <= 0) {
    // Nessuna altra categoria ha peso: non c'è nulla da riscalare. Non
    // dovrebbe capitare (i pesi base sono tutti positivi e i fattori sempre
    // > 0), ma dividere per zero qui produrrebbe NaN in tutto il piano.
    altre.forEach((c) => { nuove[c] = 0; });
    nuove.needs = 1 - obiettivo;
  } else {
    const scala = (1 - obiettivo) / sommaAltre;
    altre.forEach((c) => { nuove[c] = quote[c] * scala; });
  }
  return { quote: nuove, banda: { minimo, massimo, applicata: true } };
};

/**
 * Tendenza della spesa: ultimo mese civile COMPLETO contro la media dei mesi
 * completi precedenti. Serve almeno un mese di confronto oltre all'ultimo.
 *
 * Usa `expenses.history` già presente nel contesto: nessuna query nuova,
 * nessuna finestra ricalcolata. I mesi `parziale: true` sono esclusi — il mese
 * in corso confrontato con mesi interi mostrerebbe sempre un crollo.
 */
const tendenzaSpesa = (context) => {
  const completi = (context.expenses?.history || [])
    .filter((m) => m && m.parziale !== true && numeroValido(m.totale));
  if (completi.length < 2) return null;
  const ultimo = completi[completi.length - 1].totale;
  const precedenti = completi.slice(0, -1);
  const media = precedenti.reduce((s, m) => s + m.totale, 0) / precedenti.length;
  if (media <= 0) return null;
  const variazione = (ultimo - media) / media;
  if (variazione >= SOGLIE.variazioneSpesa) return 'aumento';
  if (variazione <= -SOGLIE.variazioneSpesa) return 'diminuzione';
  return null;
};

/**
 * Punteggio di un obiettivo per la distribuzione della quota `goals`.
 *
 * Quattro fattori, tutti già presenti nel contesto: priorità, urgenza (dallo
 * stato che `obiettiviStato.service.js` calcola), importo restante e contributo
 * mensile richiesto. Il quarto entra come fattore di ritardo: un obiettivo il
 * cui contributo richiesto supera il risparmio mensile disponibile è indietro,
 * e pesa di più.
 */
const FATTORE_RITARDO = 1.25;

const punteggioObiettivo = (obiettivo, monthlySavings) => {
  const priorita = PESO_PRIORITA[obiettivo.priorita] ?? PESO_PRIORITA.sconosciuta;
  const urgenza = PESO_URGENZA[urgenzaObiettivo(obiettivo)] ?? PESO_URGENZA.in_corso;
  const richiesto = obiettivo.contributo_mensile_richiesto;
  const indietro = numeroValido(richiesto) && numeroValido(monthlySavings)
    && monthlySavings > 0 && richiesto > monthlySavings;
  return priorita * urgenza * (indietro ? FATTORE_RITARDO : 1);
};

/** Un obiettivo è "in anticipo" quando il contributo richiesto sta sotto la
 * metà del risparmio mensile: c'è margine, non serve spingere. */
const obiettivoInAnticipo = (obiettivo, monthlySavings) => {
  const richiesto = obiettivo.contributo_mensile_richiesto;
  return numeroValido(richiesto) && numeroValido(monthlySavings)
    && monthlySavings > 0 && richiesto <= monthlySavings / 2;
};

const obiettivoIndietro = (obiettivo, monthlySavings) => {
  const richiesto = obiettivo.contributo_mensile_richiesto;
  return numeroValido(richiesto) && numeroValido(monthlySavings)
    && monthlySavings > 0 && richiesto > monthlySavings;
};

/**
 * Distribuisce la quota `goals` fra gli obiettivi eleggibili. Ogni obiettivo è
 * limitato al proprio restante, il residuo torna agli obiettivi con capacità
 * ancora libera. Ordine deterministico: punteggio decrescente, id crescente a
 * parità.
 */
const distribuisciObiettivi = (goalsCents, eleggibili, monthlySavings) => {
  if (goalsCents === 0 || eleggibili.length === 0) return [];

  const righe = eleggibili
    .map((o) => ({
      obiettivo: o,
      punteggio: punteggioObiettivo(o, monthlySavings),
      restanteCent: euroACentesimi(o.importo_restante),
    }))
    .filter((r) => r.restanteCent > 0)
    .sort((a, b) => (b.punteggio - a.punteggio) || (a.obiettivo.id - b.obiettivo.id));

  if (righe.length === 0) return [];

  const chiavi = righe.map((r) => String(r.obiettivo.id));
  const pesi = Object.fromEntries(righe.map((r) => [
    String(r.obiettivo.id), r.punteggio * r.restanteCent,
  ]));
  const cap = Object.fromEntries(righe.map((r) => [String(r.obiettivo.id), r.restanteCent]));

  const { allocazione } = ripartisciConCap(pesi, goalsCents, cap, chiavi);

  return righe.map((r) => ({
    id: r.obiettivo.id,
    nome: r.obiettivo.nome ?? null,
    priorita: r.obiettivo.priorita ?? null,
    urgenza: urgenzaObiettivo(r.obiettivo),
    stato: r.obiettivo.stato,
    remainingCents: r.restanteCent,
    amountCents: allocazione[String(r.obiettivo.id)] ?? 0,
    score: Math.round(r.punteggio * 1000) / 1000,
  }));
};

/**
 * Reason code derivati dai dati, non scritti a mano accanto ai numeri.
 *
 * Nessun codice viene emesso senza il dato che lo giustifica: è la ragione per
 * cui ogni ramo qui controlla una fascia o un valore concreto e non una
 * combinazione "plausibile".
 */
const raccogliReasonCodes = ({
  profile, context, sourceRecurring, eleggibili, capRaggiunti, allocatableCents,
}) => {
  const codici = [];

  if (allocatableCents === 0) codici.push('ZERO_ALLOCATABLE_CAPITAL');

  // Emergenza.
  if (profile.emergencyCoverage === 'CRITICAL' || profile.emergencyCoverage === 'LOW') {
    codici.push('LOW_EMERGENCY_BUFFER');
  }
  if (profile.emergencyCoverage === 'ADEQUATE' || profile.emergencyCoverage === 'STRONG') {
    codici.push('EMERGENCY_TARGET_REACHED');
  }
  if (context.emergencyFund?.status === 'assente') codici.push('NO_EMERGENCY_FUND_DEFINED');

  // Cash flow e capacità di risparmio.
  if (profile.savingsCapacity === 'NEGATIVE') codici.push('NEGATIVE_CASH_FLOW');
  if (profile.savingsCapacity === 'HIGH') codici.push('HIGH_SAVINGS_CAPACITY');
  if (profile.savingsCapacity === 'LOW') codici.push('LOW_SAVINGS_CAPACITY');

  // Reddito. MEDIUM non emette niente: non si dichiara una stabilità che i
  // dati non possono confermare (ci pensa INSUFFICIENT_HISTORY).
  if (profile.incomeStability === 'HIGH') codici.push('STABLE_INCOME');
  if (profile.incomeStability === 'LOW') codici.push('UNSTABLE_INCOME');

  if (profile.expensePressure === 'HIGH') codici.push('HIGH_EXPENSE_PRESSURE');
  if (profile.debtPressure === 'HIGH') codici.push('HIGH_DEBT_PRESSURE');

  // Obiettivi.
  if (eleggibili.length === 0) codici.push('NO_ACTIVE_GOALS');
  if (eleggibili.some((o) => o.priorita === 'alta')) codici.push('HIGH_PRIORITY_GOAL');
  const urgenzeVicine = ['vicino', 'urgente', 'scadenza_mese_corrente', 'scaduto'];
  if (eleggibili.some((o) => urgenzeVicine.includes(urgenzaObiettivo(o)))) {
    codici.push('GOAL_DEADLINE_APPROACHING');
  }
  const monthlySavings = context.cashFlow?.monthlySavings ?? null;
  if (eleggibili.some((o) => obiettivoIndietro(o, monthlySavings))) codici.push('GOAL_BEHIND_SCHEDULE');
  if (eleggibili.some((o) => obiettivoInAnticipo(o, monthlySavings))) codici.push('GOAL_AHEAD_OF_SCHEDULE');

  // Origine della somma: è un input dichiarato dall'utente, sempre presente.
  codici.push(sourceRecurring ? 'RECURRING_INCOME' : 'EXTRA_INCOME');

  // Tendenza della spesa.
  const tendenza = tendenzaSpesa(context);
  if (tendenza === 'aumento') codici.push('SPENDING_INCREASE');
  if (tendenza === 'diminuzione') codici.push('SPENDING_DECREASE');

  // Limiti dichiarati: cosa il motore NON ha potuto usare.
  if (profile.dataConfidence !== 'GOOD') codici.push('INSUFFICIENT_HISTORY');
  if ((context.liquidity?.specialAccounts ?? 0) > 0) codici.push('SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED');
  const illiquidi = (context.investments?.nonLiquidValue ?? 0)
    + (context.investments?.unknownLiquidityValue ?? 0);
  if (illiquidi > 0) codici.push('ILLIQUID_INVESTMENTS_EXCLUDED');
  if (profile.manualUsed.length > 0) codici.push('MANUAL_CONTEXT_USED');

  if (capRaggiunti.includes('goals')) codici.push('GOALS_CAP_REACHED');
  if (capRaggiunti.includes('safety')) codici.push('SAFETY_CAP_REACHED');

  return ordinaReasonCodes(codici);
};

/** Avvisi: limiti dichiarati sul piano, in italiano, per l'interfaccia. */
const raccogliWarnings = ({ profile, context, allocatableCents }) => {
  const avvisi = [];
  if (allocatableCents === 0) {
    avvisi.push('Il capitale disponibile da distribuire è zero: le spese obbligatorie assorbono tutta la somma.');
  }
  if (profile.dataConfidence === 'INSUFFICIENT') {
    avvisi.push('Lo storico registrato non basta per una stima affidabile: la proposta è volutamente prudente.');
  } else if (profile.dataConfidence === 'LIMITED') {
    avvisi.push('Lo storico registrato è limitato: la proposta è più prudente di quanto sarebbe con più mesi di dati.');
  }
  if (context.dataQuality?.missingClassificationData) {
    avvisi.push('Una parte delle uscite non ha una categoria con essenzialità: le spese essenziali potrebbero essere sottostimate.');
  }
  if (context.emergencyFund?.status === 'assente') {
    avvisi.push('Non hai un obiettivo di tipo fondo di sicurezza: la quota Sicurezza non ha un traguardo a cui fermarsi.');
  }
  if (profile.manualIgnored.length > 0) {
    avvisi.push('Alcune risposte che hai fornito non sono state usate: per quei dati WALLT ha già uno storico osservato, che ha la precedenza.');
  }
  if ((context.liquidity?.specialAccounts ?? 0) > 0) {
    avvisi.push('I saldi dei conti di gioco non sono considerati liquidità disponibile.');
  }
  return avvisi;
};

/**
 * Genera la ripartizione raccomandata.
 *
 * @param {Object} params
 * @param {number} params.incomingCents - somma in ingresso, centesimi interi > 0
 * @param {number} params.mandatoryCents - spese obbligatorie, centesimi interi >= 0
 * @param {string} params.sourceType - una di constants/pianoSmart.SOURCE_TYPES
 * @param {boolean} params.sourceRecurring - se la somma si ripete
 * @param {Object} params.context - output di getFinancialContext
 * @param {Object} [params.manualAnswers] - risposte di contesto per questo piano
 * @returns {Object} piano raccomandato, con profilo, pesi tracciati, cap,
 *   reason code e avvisi. Non tocca `context`.
 */
const generaPiano = ({
  incomingCents, mandatoryCents = 0, sourceType, sourceRecurring = false,
  context, manualAnswers = {},
}) => {
  centesimiInteri(incomingCents, 'incomingCents');
  centesimiInteri(mandatoryCents, 'mandatoryCents');
  if (incomingCents === 0) {
    throw new Error('incomingCents deve essere maggiore di zero: non c\'è nulla da pianificare');
  }
  if (!context || typeof context !== 'object') {
    throw new Error('context (FinancialContext) obbligatorio');
  }

  const allocatableCents = Math.max(incomingCents - mandatoryCents, 0);
  const profile = buildProfile(context, manualAnswers);
  const eleggibili = (context.goals || []).filter(obiettivoEleggibile);

  // ---- Capitale zero: stato esplicito, non una ripartizione di niente ----
  if (allocatableCents === 0) {
    const reasonCodes = raccogliReasonCodes({
      profile, context, sourceRecurring, eleggibili, capRaggiunti: [], allocatableCents,
    });
    const pianoZero = {
      engineVersion: ENGINE_VERSION,
      status: 'capitale_zero',
      incomingCents,
      mandatoryCents,
      allocatableCents,
      sourceType,
      sourceRecurring,
      profile,
      allocations: CATEGORIE.map((category) => ({
        category,
        recommendedCents: 0,
        recommendedPercentage: null,
        metadata: category === 'goals' ? { goals: [], totalRemainingCents: 0, capApplied: false } : {},
        reasonCodes: [],
      })),
      reasonCodes,
      warnings: raccogliWarnings({ profile, context, allocatableCents }),
      pesi: { base: { ...PESI_BASE }, modificatori: [], finali: null },
      caps: { goals: null, safety: null },
    };
    assertInvariantiMotore(pianoZero);
    return pianoZero;
  }

  // ---- 2-3. pesi base e azzeramento di eleggibilità ----
  const pesi = { ...PESI_BASE };
  if (eleggibili.length === 0) pesi.goals = 0;

  // ---- 4. modificatori ----
  const tracciato = [];
  applicaModificatore(pesi, MODIFICATORI.emergencyCoverage, profile.emergencyCoverage, tracciato, 'emergencyCoverage');
  applicaModificatore(pesi, MODIFICATORI.savingsCapacity, profile.savingsCapacity, tracciato, 'savingsCapacity');
  applicaModificatore(pesi, MODIFICATORI.incomeStability, profile.incomeStability, tracciato, 'incomeStability');
  applicaModificatore(pesi, MODIFICATORI.expensePressure, profile.expensePressure, tracciato, 'expensePressure');
  applicaModificatore(pesi, MODIFICATORI.debtPressure, profile.debtPressure, tracciato, 'debtPressure');
  applicaModificatore(pesi, MODIFICATORI.goalPressure, profile.goalPressure, tracciato, 'goalPressure');
  applicaModificatore(
    pesi, MODIFICATORI.sourceKind, sourceRecurring ? 'ricorrente' : 'occasionale', tracciato, 'sourceKind',
  );
  applicaModificatore(pesi, MODIFICATORI.dataConfidence, profile.dataConfidence, tracciato, 'dataConfidence');

  // L'azzeramento di eleggibilità deve sopravvivere ai modificatori: un
  // fattore su `goals` non può resuscitare una categoria senza destinatari.
  if (eleggibili.length === 0) pesi.goals = 0;

  // ---- 5. normalizzazione in quote ----
  const sommaPesi = CATEGORIE.reduce((s, c) => s + pesi[c], 0);
  let quote = Object.fromEntries(CATEGORIE.map((c) => [c, pesi[c] / sommaPesi]));

  // ---- 6. banda della libertà ----
  const conBanda = applicaBandaLiberta(quote, profile);
  quote = conBanda.quote;

  // ---- 7-8. centesimi, cap e redistribuzione ----
  const totaleRestanteObiettivi = eleggibili.reduce(
    (s, o) => s + euroACentesimi(o.importo_restante), 0,
  );
  // Il cap di safety esiste SOLO se l'utente ha un fondo di sicurezza: senza un
  // target che ha scelto lui non c'è un gap da rispettare, e derivarne uno
  // dalle spese significherebbe inventare un obiettivo che non ha mai posto
  // (vedi fondoSicurezza.service.js, che risponde 'assente' e non zero).
  const fondoDefinito = context.emergencyFund && context.emergencyFund.status !== 'assente'
    && numeroValido(context.emergencyFund.missingAmount);
  const caps = {
    needs: null,
    safety: fondoDefinito ? euroACentesimi(context.emergencyFund.missingAmount) : null,
    goals: eleggibili.length === 0 ? 0 : totaleRestanteObiettivi,
    future: null,
    freedom: null,
  };

  const { allocazione, capRaggiunti } = ripartisciConCap(quote, allocatableCents, caps, CATEGORIE);

  // ---- 9. breakdown per obiettivo ----
  const dettaglioObiettivi = distribuisciObiettivi(
    allocazione.goals, eleggibili, context.cashFlow?.monthlySavings ?? null,
  );

  const reasonCodes = raccogliReasonCodes({
    profile, context, sourceRecurring, eleggibili, capRaggiunti, allocatableCents,
  });

  /** I reason code pertinenti alla singola categoria: un sottoinsieme di
   * quelli del piano, così la UI può spiegare una categoria per volta. */
  const codiciPerCategoria = {
    needs: ['HIGH_EXPENSE_PRESSURE', 'NEGATIVE_CASH_FLOW', 'RECURRING_INCOME', 'HIGH_DEBT_PRESSURE', 'SPENDING_INCREASE'],
    safety: ['LOW_EMERGENCY_BUFFER', 'EMERGENCY_TARGET_REACHED', 'SAFETY_CAP_REACHED', 'UNSTABLE_INCOME', 'NO_EMERGENCY_FUND_DEFINED', 'INSUFFICIENT_HISTORY'],
    goals: ['HIGH_PRIORITY_GOAL', 'GOAL_DEADLINE_APPROACHING', 'GOAL_BEHIND_SCHEDULE', 'GOAL_AHEAD_OF_SCHEDULE', 'GOALS_CAP_REACHED', 'NO_ACTIVE_GOALS'],
    future: ['HIGH_SAVINGS_CAPACITY', 'LOW_SAVINGS_CAPACITY', 'STABLE_INCOME', 'EMERGENCY_TARGET_REACHED', 'NEGATIVE_CASH_FLOW'],
    freedom: ['HIGH_SAVINGS_CAPACITY', 'SPENDING_DECREASE', 'NEGATIVE_CASH_FLOW', 'HIGH_DEBT_PRESSURE'],
  };

  const allocations = CATEGORIE.map((category) => {
    const cents = allocazione[category];
    const metadata = {};
    if (category === 'goals') {
      metadata.goals = dettaglioObiettivi;
      metadata.totalRemainingCents = totaleRestanteObiettivi;
      metadata.capApplied = capRaggiunti.includes('goals');
    }
    if (category === 'safety') {
      metadata.emergencyGapCents = caps.safety;
      metadata.capApplied = capRaggiunti.includes('safety');
      metadata.fundStatus = context.emergencyFund?.status ?? null;
    }
    return {
      category,
      recommendedCents: cents,
      recommendedPercentage: percentuale(cents, allocatableCents),
      metadata,
      reasonCodes: reasonCodes.filter((c) => codiciPerCategoria[category].includes(c)),
    };
  });

  const piano = {
    engineVersion: ENGINE_VERSION,
    status: 'ok',
    incomingCents,
    mandatoryCents,
    allocatableCents,
    sourceType,
    sourceRecurring,
    profile,
    allocations,
    reasonCodes,
    warnings: raccogliWarnings({ profile, context, allocatableCents }),
    pesi: {
      base: { ...PESI_BASE },
      modificatori: tracciato,
      banda: conBanda.banda,
      finali: quote,
    },
    caps,
  };

  // Autocontrollo: un piano matematicamente sbagliato non esce da qui. Una
  // violazione è un bug del motore, non un input non valido, quindi lancia
  // invece di essere corretta in silenzio.
  assertInvariantiMotore(piano);
  return piano;
};

module.exports = {
  generaPiano,
  ripartisciConCap,
  tendenzaSpesa,
  punteggioObiettivo,
  distribuisciObiettivi,
};
