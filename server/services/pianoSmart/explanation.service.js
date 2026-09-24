/**
 * Spiegazioni deterministiche: da reason code a testo italiano.
 *
 * Una tabella, niente generazione. L'interfaccia riceve al massimo cinque
 * motivazioni, scelte per priorità (vedi reasonCodes.js), e ognuna corrisponde
 * a un codice che il motore ha emesso solo perché aveva il dato per farlo.
 *
 * Confine per un'eventuale AI futura: potrà RIFORMULARE questi testi, nient
 * altro. Non potrà cambiare i numeri, aggiungere o togliere reason code,
 * inventare informazioni, né suggerire strumenti finanziari specifici (ETF,
 * azioni, crypto, prodotti di terzi). Piano Smart non dà consigli di
 * investimento.
 *
 * I testi non contengono importi: gli importi stanno nelle allocazioni, e
 * duplicarli qui vorrebbe dire tenerli allineati in due posti.
 */

const SPIEGAZIONI = {
  ZERO_ALLOCATABLE_CAPITAL: {
    titolo: 'Non c\'è capitale da distribuire',
    testo: 'Le spese obbligatorie che hai indicato assorbono tutta la somma: non resta nulla da ripartire.',
  },
  NEGATIVE_CASH_FLOW: {
    titolo: 'Spendi più di quanto incassi',
    testo: 'Nei mesi completi registrati le uscite superano le entrate: la proposta rafforza necessità e sicurezza e riduce molto futuro e libertà.',
  },
  LOW_EMERGENCY_BUFFER: {
    titolo: 'Fondo di sicurezza sotto il traguardo',
    testo: 'Il fondo non copre ancora i mesi di spese essenziali che ti sei dato: una quota maggiore va alla sicurezza.',
  },
  HIGH_DEBT_PRESSURE: {
    titolo: 'Le rate pesano sul reddito',
    testo: 'Le rate mensili assorbono una parte importante del reddito ricorrente: la proposta è più prudente. WALLT non suggerisce di usare tutta la somma per estinguere un debito.',
  },
  HIGH_EXPENSE_PRESSURE: {
    titolo: 'Le spese essenziali pesano molto',
    testo: 'Le spese indispensabili assorbono una quota alta del reddito ricorrente: la parte destinata alle necessità cresce.',
  },
  EMERGENCY_TARGET_REACHED: {
    titolo: 'Fondo di sicurezza completo',
    testo: 'Il fondo ha raggiunto il traguardo che gli hai dato: la quota destinata alla sicurezza si riduce e il capitale va dove serve di più.',
  },
  SAFETY_CAP_REACHED: {
    titolo: 'Sicurezza limitata a quanto manca',
    testo: 'Alla sicurezza non è stato assegnato più di quanto manchi al fondo: il resto è stato redistribuito.',
  },
  GOALS_CAP_REACHED: {
    titolo: 'Obiettivi limitati a quanto resta da raggiungere',
    testo: 'Agli obiettivi non è stato assegnato più di quanto manchi per completarli: il resto è stato redistribuito.',
  },
  NO_ACTIVE_GOALS: {
    titolo: 'Nessun obiettivo attivo',
    testo: 'Non hai obiettivi da finanziare, quindi quella quota è stata redistribuita. Creando un obiettivo, i piani successivi potranno tenerne conto.',
  },
  NO_EMERGENCY_FUND_DEFINED: {
    titolo: 'Nessun fondo di sicurezza impostato',
    testo: 'Non hai un obiettivo di tipo fondo di sicurezza: WALLT non inventa un traguardo al posto tuo, quindi la quota Sicurezza resta senza un limite a cui fermarsi.',
  },
  HIGH_PRIORITY_GOAL: {
    titolo: 'Hai un obiettivo a priorità alta',
    testo: 'Fra gli obiettivi attivi ce n\'è almeno uno che hai marcato come prioritario: riceve una quota maggiore.',
  },
  GOAL_DEADLINE_APPROACHING: {
    titolo: 'Una scadenza si avvicina',
    testo: 'Almeno un obiettivo ha una scadenza vicina: la quota destinata agli obiettivi cresce.',
  },
  GOAL_BEHIND_SCHEDULE: {
    titolo: 'Un obiettivo è in ritardo',
    testo: 'Per almeno un obiettivo il versamento mensile necessario supera quello che riesci a risparmiare ogni mese.',
  },
  GOAL_AHEAD_OF_SCHEDULE: {
    titolo: 'Un obiettivo è in anticipo',
    testo: 'Per almeno un obiettivo il versamento necessario è ampiamente sotto la tua capacità di risparmio: c\'è margine.',
  },
  UNSTABLE_INCOME: {
    titolo: 'Entrate variabili',
    testo: 'Le entrate dei mesi completi oscillano in modo marcato: la proposta tiene una riserva più alta.',
  },
  STABLE_INCOME: {
    titolo: 'Entrate stabili',
    testo: 'Le entrate dei mesi completi sono regolari: la ripartizione può permettersi di essere meno conservativa.',
  },
  HIGH_SAVINGS_CAPACITY: {
    titolo: 'Buona capacità di risparmio',
    testo: 'Fra entrate e uscite resta un margine consistente ogni mese: più spazio a futuro e obiettivi.',
  },
  LOW_SAVINGS_CAPACITY: {
    titolo: 'Margine di risparmio ridotto',
    testo: 'Fra entrate e uscite resta poco ogni mese: la proposta tiene conto delle necessità prima del resto.',
  },
  EXTRA_INCOME: {
    titolo: 'Somma occasionale',
    testo: 'Hai indicato una somma che non si ripete: non deve coprire un mese ordinario, quindi può rafforzare sicurezza, obiettivi e futuro.',
  },
  RECURRING_INCOME: {
    titolo: 'Somma ricorrente',
    testo: 'Hai indicato una somma che si ripete: la proposta tiene conto delle spese del mese che comincia.',
  },
  SPENDING_INCREASE: {
    titolo: 'Le spese sono aumentate',
    testo: 'L\'ultimo mese completo registra uscite superiori alla media dei mesi precedenti.',
  },
  SPENDING_DECREASE: {
    titolo: 'Le spese sono diminuite',
    testo: 'L\'ultimo mese completo registra uscite inferiori alla media dei mesi precedenti.',
  },
  INSUFFICIENT_HISTORY: {
    titolo: 'Storico limitato',
    testo: 'I mesi completi registrati non bastano per una stima piena: la proposta è volutamente prudente. Continuando a registrare i movimenti, i piani successivi saranno più precisi.',
  },
  SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED: {
    titolo: 'Conti di gioco esclusi',
    testo: 'I saldi dei conti di gioco non sono considerati liquidità disponibile per questo piano.',
  },
  ILLIQUID_INVESTMENTS_EXCLUDED: {
    titolo: 'Investimenti non liquidabili esclusi',
    testo: 'Gli investimenti vincolati o con liquidabilità sconosciuta non contano come denaro disponibile: restano nel patrimonio, non nel capitale da distribuire.',
  },
  MANUAL_CONTEXT_USED: {
    titolo: 'Hai completato i dati mancanti',
    testo: 'Alcune informazioni che WALLT non aveva le hai fornite tu: valgono per questo piano e non modificano i tuoi movimenti, conti o obiettivi.',
  },
};

/** Quante motivazioni al massimo vanno all'interfaccia. Oltre questo numero
 * l'elenco smette di essere una spiegazione e diventa un referto. */
const MAX_SPIEGAZIONI = 5;

/**
 * @param {string[]} reasonCodes - già ordinati per priorità dal motore
 * @param {number} [limite]
 * @returns {Array<{code:string, titolo:string, testo:string}>}
 */
const spiegaReasonCodes = (reasonCodes, limite = MAX_SPIEGAZIONI) => (reasonCodes || [])
  .filter((code) => SPIEGAZIONI[code])
  .slice(0, limite)
  .map((code) => ({ code, ...SPIEGAZIONI[code] }));

/** Ogni reason code deve avere un testo: un codice senza spiegazione
 * arriverebbe all'utente come una sigla. Usato dai test come rete. */
const codiciSenzaSpiegazione = (elenco) => elenco.filter((c) => !SPIEGAZIONI[c]);

module.exports = {
  SPIEGAZIONI, MAX_SPIEGAZIONI, spiegaReasonCodes, codiciSenzaSpiegazione,
};
