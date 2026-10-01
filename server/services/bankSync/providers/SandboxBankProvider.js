const { BankProvider, BankProviderError, mascheraIban } = require('./BankProvider');
const {
  PROVIDER_SANDBOX, TX_BOOKED, TX_PENDING, ERR_PROVIDER,
} = require('../../../constants/bankSync');

/**
 * Provider finto, deterministico, per sviluppo locale e test automatici.
 *
 * ── Non è un mock in produzione ──────────────────────────────────────────
 * `providers/index.js` si RIFIUTA di istanziarlo quando
 * `NODE_ENV === 'production'`, e la configurazione `bank_sync_provider` non
 * può valere `sandbox` in produzione. Non è una convenzione da ricordare: è
 * un errore lanciato. Il motivo per cui esiste è l'opposto di introdurre
 * finzioni nei dati reali — serve a poter sviluppare e testare l'intero
 * flusso (autorizzazione, callback, saldi, transazioni, scadenza del
 * consenso, revoca, errori) senza usare mai credenziali bancarie vere,
 * come il brief richiede prima del passaggio in produzione.
 *
 * ── Deterministico per progetto ──────────────────────────────────────────
 * Le transazioni restituite sono quelle passate al costruttore, con gli
 * stessi identificatori a ogni chiamata. È questo che permette di verificare
 * l'idempotenza: due sincronizzazioni di seguito vedono esattamente le stesse
 * transazioni, e se il motore ne creasse due copie il test lo vedrebbe.
 *
 * ── Scenari d'errore ─────────────────────────────────────────────────────
 * `errore` fa fallire la chiamata successiva con un codice scelto: è così che
 * si verifica che un errore del provider non distrugga i dati già importati.
 */

const oggiMeno = (giorni) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - giorni);
  return d.toISOString().slice(0, 10);
};

/** Un piccolo estratto conto plausibile: due uscite, un'entrata, una
 * `pending` (che per progetto NON deve diventare un movimento). */
const TRANSAZIONI_DEFAULT = () => [
  {
    providerTransactionId: 'sbx-tx-001',
    status: TX_BOOKED,
    importo: -42.5,
    valuta: 'EUR',
    bookingDate: oggiMeno(3),
    valueDate: oggiMeno(3),
    descrizione: 'ESSELUNGA SPA MILANO',
    merchantName: 'Esselunga',
    controparte: 'Esselunga',
    categoriaProvider: null,
  },
  {
    providerTransactionId: 'sbx-tx-002',
    status: TX_BOOKED,
    importo: -11.9,
    valuta: 'EUR',
    bookingDate: oggiMeno(2),
    valueDate: oggiMeno(2),
    descrizione: 'NETFLIX.COM ABBONAMENTO',
    merchantName: 'Netflix',
    controparte: 'Netflix',
    categoriaProvider: null,
  },
  {
    providerTransactionId: 'sbx-tx-003',
    status: TX_BOOKED,
    importo: 1850,
    valuta: 'EUR',
    bookingDate: oggiMeno(1),
    valueDate: oggiMeno(1),
    descrizione: 'STIPENDIO MENSILE',
    merchantName: null,
    controparte: 'Datore di lavoro',
    categoriaProvider: null,
  },
  {
    providerTransactionId: 'sbx-tx-004',
    status: TX_PENDING,
    importo: -7.4,
    valuta: 'EUR',
    bookingDate: oggiMeno(0),
    valueDate: oggiMeno(0),
    descrizione: 'BAR CENTRALE',
    merchantName: 'Bar Centrale',
    controparte: 'Bar Centrale',
    categoriaProvider: null,
  },
];

class SandboxBankProvider extends BankProvider {
  /**
   * @param {Object} [opzioni]
   * @param {Array}  [opzioni.transazioni] le transazioni restituite
   * @param {string} [opzioni.stato]       stato della connessione simulato
   * @param {number} [opzioni.saldo]
   * @param {{codice: string, messaggio?: string}|null} [opzioni.errore]
   *   fa fallire `getTransactions` (e solo quella) con questo codice
   */
  constructor({
    transazioni = TRANSAZIONI_DEFAULT(),
    stato = 'attiva',
    saldo = 2345.67,
    errore = null,
    iban = 'IT60X0542811101000000123456',
  } = {}) {
    super();
    this.transazioni = transazioni;
    this.stato = stato;
    this.saldo = saldo;
    this.errore = errore;
    this.iban = iban;
    this.chiamate = { createAuthorization: 0, getTransactions: 0, revokeConnection: 0 };
  }

  get nome() { return PROVIDER_SANDBOX; }

  // eslint-disable-next-line class-methods-use-this
  async isConfigurato() { return true; }

  // eslint-disable-next-line class-methods-use-this
  async listIstituti(paese = 'IT') {
    return [
      { id: 'SANDBOX_BANCA_IT', nome: 'Banca di Prova', logo: null, paesi: [paese], giorni_storico: 90 },
      { id: 'SANDBOX_REVOLUT_IT', nome: 'Revolut (prova)', logo: null, paesi: [paese], giorni_storico: 90 },
    ];
  }

  async createAuthorization({ institutionId, redirectUrl, reference }) {
    this.chiamate.createAuthorization += 1;
    const id = `sbx-req-${reference.slice(0, 12)}`;
    return {
      providerConnectionId: id,
      // Nel flusso vero questa è la pagina della banca. In sandbox torna
      // direttamente al callback di WALLT, così il giro si chiude in locale.
      urlAutorizzazione: `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}ref=${encodeURIComponent(reference)}&institution=${encodeURIComponent(institutionId)}`,
      consentCreatedAt: new Date(),
      consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };
  }

  async getConnectionStatus({ providerConnectionId }) {
    return {
      stato: this.stato,
      statoProvider: this.stato === 'attiva' ? 'LN' : 'EX',
      accountIds: [`sbx-acc-${String(providerConnectionId).slice(-6)}`],
      consentExpiresAt: null,
    };
  }

  async handleCallback({ providerConnectionId }) {
    const stato = await this.getConnectionStatus({ providerConnectionId });
    if (stato.stato !== 'attiva') {
      throw new BankProviderError(ERR_PROVIDER, `Sandbox: stato ${stato.stato}`, { statusCode: 409 });
    }
    return { stato: stato.stato, conti: await this.getAccounts({ accountIds: stato.accountIds }) };
  }

  async getAccounts({ accountIds = [] }) {
    return accountIds.map((accountId) => ({
      providerAccountId: accountId,
      nome: 'Conto di Prova',
      ibanMascherato: mascheraIban(this.iban),
      valuta: 'EUR',
      saldo: this.saldo,
      istituto: { id: 'SANDBOX_BANCA_IT', nome: 'Banca di Prova' },
    }));
  }

  async getTransactions() {
    this.chiamate.getTransactions += 1;
    if (this.errore) {
      throw new BankProviderError(
        this.errore.codice,
        this.errore.messaggio || `Sandbox: errore simulato ${this.errore.codice}`,
      );
    }
    return {
      booked: this.transazioni.filter((t) => t.status === TX_BOOKED),
      pending: this.transazioni.filter((t) => t.status === TX_PENDING),
      saldo: this.saldo,
    };
  }

  async refreshConnection(dati) {
    return this.createAuthorization(dati);
  }

  async revokeConnection() {
    this.chiamate.revokeConnection += 1;
    return { revocata: true };
  }
}

module.exports = SandboxBankProvider;
module.exports.TRANSAZIONI_DEFAULT = TRANSAZIONI_DEFAULT;
