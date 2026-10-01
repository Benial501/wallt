/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BankProvider — l'interfaccia che il resto di WALLT conosce
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nessun'altra parte del codice sa che esista GoCardless. Il motore di
 * sincronizzazione, i controller, i servizi delle connessioni parlano con
 * questa interfaccia e con le forme normalizzate dichiarate qui sotto.
 * Sostituire il provider — GoCardless → Tink, o un secondo provider per un
 * paese diverso — significa scrivere una nuova classe e cambiare una riga di
 * configurazione (`bank_sync_provider`), non riscrivere WALLT.
 *
 * ── Dove vivono i segreti ────────────────────────────────────────────────
 * Esclusivamente nelle variabili d'ambiente del server. Mai nel bundle Vite,
 * mai in una risposta API, mai in un log, mai nel database. Un'implementazione
 * può tenere un token applicativo in memoria per la durata dell'istanza (è il
 * caso di GoCardless, che ne emette uno a breve scadenza), ma non deve
 * persisterlo: la riga della connessione contiene solo identificatori opachi.
 *
 * ── Le forme normalizzate ────────────────────────────────────────────────
 * Sono il contratto. Un'implementazione che restituisse i campi grezzi del
 * provider farebbe rientrare la sua struttura dentro WALLT, cioè annullerebbe
 * il motivo per cui questa interfaccia esiste.
 *
 * Autorizzazione:
 *   { providerConnectionId, urlAutorizzazione, consentCreatedAt,
 *     consentExpiresAt }
 *
 * Conto:
 *   { providerAccountId, nome, ibanMascherato, valuta, saldo, istituto:
 *     { id, nome } }
 *
 * Transazione (`ProviderTransaction`):
 *   { providerTransactionId, status, importo, valuta, bookingDate,
 *     valueDate, descrizione, merchantName, controparte, categoriaProvider }
 *
 *   `importo` è firmato come lo dà la banca: negativo = uscita. La
 *   traduzione in entrata/uscita WALLT la fa `normalizer.js`, non il
 *   provider, così la convenzione dei segni resta in un punto solo.
 *
 * Stato connessione:
 *   { stato: 'attiva'|'consenso_scaduto'|'revocata'|'sconosciuto',
 *     consentExpiresAt }
 *
 * ── Minimizzazione ───────────────────────────────────────────────────────
 * Le implementazioni restituiscono SOLO questi campi. Il payload completo
 * della banca non viene conservato: non ci serve, e conservarlo
 * significherebbe custodire dati bancari grezzi senza una ragione (il brief
 * lo vieta, e il GDPR con lui). L'IBAN esce già mascherato dal provider:
 * `mascheraIban` qui sotto è l'unica funzione autorizzata a produrlo, così
 * nessuna implementazione può decidere di passarlo intero.
 */

class BankProvider {
  /** Identificatore scritto in `bank_connections.provider`. */
  // eslint-disable-next-line class-methods-use-this
  get nome() {
    throw new Error('BankProvider.nome non implementato');
  }

  /** Il provider ha le credenziali che gli servono? Se no, le rotte
   * rispondono con un errore di configurazione invece di tentare chiamate
   * destinate a fallire. */
  // eslint-disable-next-line class-methods-use-this
  async isConfigurato() {
    return false;
  }

  /** Le banche disponibili per un paese. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async listIstituti(_paese) {
    throw new Error('BankProvider.listIstituti non implementato');
  }

  /**
   * Avvia un'autorizzazione.
   * @param {{institutionId: string, redirectUrl: string, reference: string}} _dati
   *   `reference` è un identificatore opaco generato da WALLT e passato al
   *   provider: non contiene l'id dell'utente, perché non deve essere
   *   possibile dedurre o manipolare l'utente da ciò che transita nel browser.
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async createAuthorization(_dati) {
    throw new Error('BankProvider.createAuthorization non implementato');
  }

  /** Completa l'autorizzazione dopo il ritorno dell'utente e restituisce i
   * conti disponibili. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async handleCallback(_dati) {
    throw new Error('BankProvider.handleCallback non implementato');
  }

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getAccounts(_dati) {
    throw new Error('BankProvider.getAccounts non implementato');
  }

  /**
   * Le transazioni di un conto in una finestra temporale.
   * @returns {Promise<{booked: object[], pending: object[], saldo: number|null}>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getTransactions(_dati) {
    throw new Error('BankProvider.getTransactions non implementato');
  }

  /** Avvia il rinnovo di un consenso scaduto. Normalmente equivale a una
   * nuova autorizzazione. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async refreshConnection(_dati) {
    throw new Error('BankProvider.refreshConnection non implementato');
  }

  /** Revoca il consenso presso il provider. Deve essere tollerante: una
   * connessione già inesistente non è un errore da propagare, perché
   * l'obiettivo dello scollegamento è raggiunto comunque. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async revokeConnection(_dati) {
    throw new Error('BankProvider.revokeConnection non implementato');
  }

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getConnectionStatus(_dati) {
    throw new Error('BankProvider.getConnectionStatus non implementato');
  }
}

/**
 * L'unica funzione autorizzata a produrre la forma mascherata di un IBAN.
 *
 * Conserviamo le ultime 4 cifre e il paese: bastano a far riconoscere il
 * conto a chi lo possiede e non bastano a disporne. Un IBAN completo in
 * database sarebbe un identificatore bancario diretto conservato senza
 * necessità.
 */
const mascheraIban = (iban) => {
  if (typeof iban !== 'string') return null;
  const pulito = iban.replace(/\s+/g, '').toUpperCase();
  if (pulito.length < 8) return null;
  return `${pulito.slice(0, 2)}•••${pulito.slice(-4)}`;
};

/**
 * Errore di provider con un codice che WALLT sa interpretare.
 *
 * Il messaggio tecnico resta qui e finisce nei log del server; all'utente
 * arriva una frase scelta dal client sulla base del `codice`. La risposta
 * HTTP grezza del provider non viene mai propagata: potrebbe contenere
 * identificatori o dettagli dell'infrastruttura.
 */
class BankProviderError extends Error {
  constructor(codice, messaggio, { statusCode = 502, causa = null } = {}) {
    super(messaggio);
    this.name = 'BankProviderError';
    this.codice = codice;
    this.statusCode = statusCode;
    this.causa = causa;
  }
}

module.exports = { BankProvider, BankProviderError, mascheraIban };
