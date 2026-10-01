const logger = require('../../../utils/logger');
const { BankProvider, BankProviderError, mascheraIban } = require('./BankProvider');
const {
  PROVIDER_GOCARDLESS, TX_BOOKED, TX_PENDING,
  ERR_NETWORK, ERR_PROVIDER, ERR_RATE_LIMIT, ERR_CONSENT_EXPIRED,
  ERR_AUTHORIZATION_REVOKED, ERR_BANK_UNAVAILABLE, ERR_CONFIG,
} = require('../../../constants/bankSync');

/**
 * Adapter GoCardless Bank Account Data (ex Nordigen).
 *
 * ── I segreti ────────────────────────────────────────────────────────────
 * `GOCARDLESS_SECRET_ID` e `GOCARDLESS_SECRET_KEY` stanno SOLO
 * nell'ambiente del server. Non sono prefissati `VITE_`, quindi non possono
 * finire nel bundle del client nemmeno per errore. Il token di accesso che
 * ne deriva vive in memoria per la durata dell'istanza e non viene mai
 * scritto nel database né nei log: `_token` non esce da questo file.
 *
 * ── Cosa persiste WALLT di questo provider ───────────────────────────────
 * Due identificatori opachi: la requisition (`provider_connection_id`) e
 * l'account (`provider_account_id`). Non sono credenziali — senza il segreto
 * applicativo non aprono nulla — e sono gli unici handle necessari per
 * leggere e revocare il consenso.
 *
 * ── Nessuna credenziale bancaria ─────────────────────────────────────────
 * L'utente inserisce le proprie credenziali sul dominio della sua banca,
 * dentro il flusso del provider. WALLT non le vede, non le riceve e non ha
 * un campo in cui metterle.
 *
 * ── Perché la mappa degli stati è esplicita ──────────────────────────────
 * GoCardless usa codici di due lettere (`LN`, `EX`, `RJ`…). Tradurli qui, e
 * non dove si prendono le decisioni, è ciò che permette a WALLT di ragionare
 * sui propri stati: il giorno in cui si passa a un altro provider cambia
 * questa tabella, non il motore di sincronizzazione.
 */

const BASE_URL_DEFAULT = 'https://bankaccountdata.gocardless.com/api/v2';
const TIMEOUT_MS = 20000;
/** Margine di sicurezza sulla scadenza del token: meglio rinnovarlo un
 * minuto prima che scoprirlo scaduto a metà di una sincronizzazione. */
const MARGINE_TOKEN_MS = 60 * 1000;

/** Codici di stato di una requisition GoCardless → stati WALLT. */
const STATO_REQUISITION = {
  CR: 'in_attesa', // created
  GC: 'in_attesa', // giving consent
  UA: 'in_attesa', // undergoing authentication
  SA: 'in_attesa', // selecting accounts
  GA: 'in_attesa', // granting access
  LN: 'attiva', // linked
  EX: 'consenso_scaduto', // expired
  RJ: 'revocata', // rejected
  SU: 'revocata', // suspended
};

const toNumber = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

class GoCardlessBankProvider extends BankProvider {
  constructor({
    secretId = process.env.GOCARDLESS_SECRET_ID,
    secretKey = process.env.GOCARDLESS_SECRET_KEY,
    baseUrl = process.env.GOCARDLESS_BASE_URL || BASE_URL_DEFAULT,
    fetchImpl = globalThis.fetch,
  } = {}) {
    super();
    this._secretId = secretId;
    this._secretKey = secretKey;
    this._baseUrl = String(baseUrl).replace(/\/+$/, '');
    this._fetch = fetchImpl;
    /** @type {{valore: string, scadenza: number}|null} in memoria, mai su disco */
    this._token = null;
  }

  get nome() { return PROVIDER_GOCARDLESS; }

  async isConfigurato() {
    return !!(this._secretId && this._secretKey);
  }

  _assertConfigurato() {
    if (!this._secretId || !this._secretKey) {
      throw new BankProviderError(
        ERR_CONFIG,
        'GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY non configurati',
        { statusCode: 503 },
      );
    }
  }

  /**
   * Traduce una risposta HTTP del provider in un errore con codice WALLT.
   * Il corpo grezzo NON viene propagato all'utente: finisce solo nei log,
   * già sanitizzati, e potrebbe contenere identificatori.
   */
  _erroreDaRisposta(risposta, contesto) {
    const stato = risposta.status;
    let codice = ERR_PROVIDER;
    if (stato === 429) codice = ERR_RATE_LIMIT;
    else if (stato === 401 || stato === 403) codice = ERR_PROVIDER;
    else if (stato === 409) codice = ERR_CONSENT_EXPIRED;
    else if (stato >= 500) codice = ERR_BANK_UNAVAILABLE;

    logger.warn('Risposta non valida dal provider bancario', {
      contesto, http_status: stato,
    });
    return new BankProviderError(codice, `GoCardless ${contesto}: HTTP ${stato}`, {
      statusCode: codice === ERR_RATE_LIMIT ? 429 : 502,
    });
  }

  async _richiesta(percorso, { metodo = 'GET', corpo = null, conToken = true, contesto } = {}) {
    const headers = { Accept: 'application/json' };
    if (corpo) headers['Content-Type'] = 'application/json';
    if (conToken) headers.Authorization = `Bearer ${await this._accessToken()}`;

    let risposta;
    try {
      risposta = await this._fetch(`${this._baseUrl}${percorso}`, {
        method: metodo,
        headers,
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Timeout o rete: distinto da un errore del provider, perché porta a
      // un'azione diversa (riprovare, non ricollegare).
      throw new BankProviderError(ERR_NETWORK, `GoCardless ${contesto}: rete non raggiungibile`, {
        statusCode: 504, causa: error.name,
      });
    }

    if (risposta.status === 204) return null;
    if (!risposta.ok) throw this._erroreDaRisposta(risposta, contesto);

    try {
      return await risposta.json();
    } catch {
      throw new BankProviderError(ERR_PROVIDER, `GoCardless ${contesto}: risposta non interpretabile`);
    }
  }

  /** Token applicativo, in memoria. Rinnovato con un minuto di margine. */
  async _accessToken() {
    this._assertConfigurato();
    if (this._token && this._token.scadenza - MARGINE_TOKEN_MS > Date.now()) {
      return this._token.valore;
    }

    const dati = await this._richiesta('/token/new/', {
      metodo: 'POST',
      conToken: false,
      corpo: { secret_id: this._secretId, secret_key: this._secretKey },
      contesto: 'token',
    });

    if (!dati?.access) {
      throw new BankProviderError(ERR_PROVIDER, 'GoCardless token: risposta senza access token');
    }

    const durataSecondi = toNumber(dati.access_expires) ?? 3600;
    this._token = { valore: dati.access, scadenza: Date.now() + durataSecondi * 1000 };
    return this._token.valore;
  }

  async listIstituti(paese = 'IT') {
    const codice = String(paese || 'IT').toUpperCase().slice(0, 2);
    const dati = await this._richiesta(`/institutions/?country=${codice}`, { contesto: 'institutions' });
    const elenco = Array.isArray(dati) ? dati : [];
    return elenco.map((i) => ({
      id: i.id,
      nome: i.name,
      logo: i.logo ?? null,
      paesi: Array.isArray(i.countries) ? i.countries : [codice],
      giorni_storico: toNumber(i.transaction_total_days) ?? 90,
    }));
  }

  async createAuthorization({ institutionId, redirectUrl, reference }) {
    const dati = await this._richiesta('/requisitions/', {
      metodo: 'POST',
      corpo: {
        institution_id: institutionId,
        redirect: redirectUrl,
        // `reference` è opaco e generato da WALLT. NON contiene l'id utente:
        // ciò che transita nel browser non deve permettere di dedurre o
        // manipolare a quale utente si collegherà il conto.
        reference,
        user_language: 'IT',
      },
      contesto: 'requisitions',
    });

    if (!dati?.id || !dati?.link) {
      throw new BankProviderError(ERR_PROVIDER, 'GoCardless requisitions: risposta incompleta');
    }

    return {
      providerConnectionId: dati.id,
      urlAutorizzazione: dati.link,
      consentCreatedAt: dati.created ? new Date(dati.created) : new Date(),
      // GoCardless non dichiara la scadenza del consenso nella requisition:
      // il default dell'accordo è 90 giorni. Resta una stima dichiarata come
      // tale, e lo stato reale si rilegge da `getConnectionStatus`.
      consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    };
  }

  async getConnectionStatus({ providerConnectionId }) {
    const dati = await this._richiesta(`/requisitions/${encodeURIComponent(providerConnectionId)}/`, {
      contesto: 'requisition-status',
    });
    return {
      stato: STATO_REQUISITION[dati?.status] ?? 'sconosciuto',
      statoProvider: dati?.status ?? null,
      accountIds: Array.isArray(dati?.accounts) ? dati.accounts : [],
      consentExpiresAt: null,
    };
  }

  async handleCallback({ providerConnectionId }) {
    const stato = await this.getConnectionStatus({ providerConnectionId });

    if (stato.stato === 'consenso_scaduto') {
      throw new BankProviderError(ERR_CONSENT_EXPIRED, 'Consenso scaduto prima del completamento', { statusCode: 409 });
    }
    if (stato.stato === 'revocata') {
      throw new BankProviderError(ERR_AUTHORIZATION_REVOKED, 'Autorizzazione rifiutata o sospesa', { statusCode: 409 });
    }
    if (stato.stato !== 'attiva' || stato.accountIds.length === 0) {
      throw new BankProviderError(ERR_PROVIDER, 'Autorizzazione non completata presso la banca', { statusCode: 409 });
    }

    const conti = await this.getAccounts({ accountIds: stato.accountIds });
    return { stato: stato.stato, conti };
  }

  async getAccounts({ accountIds = [] }) {
    const conti = [];
    for (const accountId of accountIds) {
      // In serie e non in parallelo: il provider applica un rate limit per
      // account, e un utente collega un conto solo, quindi la latenza non
      // vale il rischio di un 429.
      const [dettagli, saldi] = [
        await this._richiesta(`/accounts/${encodeURIComponent(accountId)}/details/`, { contesto: 'account-details' }),
        await this._richiesta(`/accounts/${encodeURIComponent(accountId)}/balances/`, { contesto: 'account-balances' })
          .catch(() => null),
      ];

      const conto = dettagli?.account ?? {};
      conti.push({
        providerAccountId: accountId,
        nome: conto.name || conto.product || conto.ownerName || null,
        ibanMascherato: mascheraIban(conto.iban),
        valuta: typeof conto.currency === 'string' ? conto.currency.slice(0, 3) : null,
        saldo: this._saldoDaBalances(saldi),
        istituto: { id: null, nome: null },
      });
    }
    return conti;
  }

  /** Il saldo contabile, se la banca lo dichiara. Preferisce il saldo
   * `interimAvailable`/`closingBooked`: sono i due che corrispondono a
   * "quanto c'è sul conto adesso". */
  // eslint-disable-next-line class-methods-use-this
  _saldoDaBalances(saldi) {
    const elenco = Array.isArray(saldi?.balances) ? saldi.balances : [];
    const perTipo = (tipo) => elenco.find((b) => b.balanceType === tipo);
    const scelto = perTipo('interimAvailable') || perTipo('closingBooked')
      || perTipo('expected') || elenco[0];
    return scelto ? toNumber(scelto.balanceAmount?.amount) : null;
  }

  async getTransactions({ providerAccountId, dataDa, dataA }) {
    const parametri = new URLSearchParams();
    if (dataDa) parametri.set('date_from', dataDa);
    if (dataA) parametri.set('date_to', dataA);
    const query = parametri.toString() ? `?${parametri.toString()}` : '';

    const dati = await this._richiesta(
      `/accounts/${encodeURIComponent(providerAccountId)}/transactions/${query}`,
      { contesto: 'transactions' },
    );

    const grezze = dati?.transactions ?? {};
    return {
      booked: (Array.isArray(grezze.booked) ? grezze.booked : [])
        .map((t) => this._normalizzaTransazione(t, TX_BOOKED)),
      pending: (Array.isArray(grezze.pending) ? grezze.pending : [])
        .map((t) => this._normalizzaTransazione(t, TX_PENDING)),
      saldo: null,
    };
  }

  /**
   * Da transazione GoCardless a `ProviderTransaction`.
   *
   * Vengono conservati solo i campi che servono. Il payload completo della
   * banca non entra in WALLT: non ci serve, e custodire dati bancari grezzi
   * senza necessità è esattamente ciò che la minimizzazione vieta.
   *
   * `transactionId` è l'identificatore stabile; `internalTransactionId` è il
   * ripiego quando la banca non ne fornisce uno. Se mancano entrambi la
   * transazione resta senza id e il motore la dedupla per impronta (vedi
   * normalizer.js): non inventiamo un id, perché un id instabile sarebbe
   * peggio di nessun id.
   */
  // eslint-disable-next-line class-methods-use-this
  _normalizzaTransazione(t, status) {
    const controparte = t.creditorName || t.debtorName || null;
    const descrizione = [
      Array.isArray(t.remittanceInformationUnstructuredArray)
        ? t.remittanceInformationUnstructuredArray.join(' ')
        : t.remittanceInformationUnstructured,
      t.additionalInformation,
      controparte,
    ].find((v) => typeof v === 'string' && v.trim().length > 0) || 'Operazione bancaria';

    return {
      providerTransactionId: t.transactionId || t.internalTransactionId || null,
      status,
      importo: toNumber(t.transactionAmount?.amount),
      valuta: typeof t.transactionAmount?.currency === 'string'
        ? t.transactionAmount.currency.slice(0, 3) : null,
      bookingDate: t.bookingDate || t.valueDate || null,
      valueDate: t.valueDate || t.bookingDate || null,
      descrizione: String(descrizione).trim().slice(0, 500),
      merchantName: controparte ? String(controparte).trim().slice(0, 200) : null,
      controparte,
      categoriaProvider: t.merchantCategoryCode || t.proprietaryBankTransactionCode || null,
    };
  }

  async refreshConnection({ institutionId, redirectUrl, reference }) {
    // Su GoCardless un consenso scaduto non si rinnova: si crea una nuova
    // requisition. Dirlo qui, e non al chiamante, è il punto
    // dell'astrazione — un altro provider potrebbe avere un vero refresh.
    return this.createAuthorization({ institutionId, redirectUrl, reference });
  }

  async revokeConnection({ providerConnectionId }) {
    if (!providerConnectionId) return { revocata: true };
    try {
      await this._richiesta(`/requisitions/${encodeURIComponent(providerConnectionId)}/`, {
        metodo: 'DELETE',
        contesto: 'requisition-delete',
      });
      return { revocata: true };
    } catch (error) {
      // Una requisition già inesistente non è un errore da propagare:
      // l'obiettivo dello scollegamento è raggiunto comunque, e far fallire
      // la disconnessione lascerebbe l'utente con una connessione che non
      // riesce a togliere.
      logger.warn('Revoca consenso presso il provider non confermata', {
        codice: error.codice ?? null,
      });
      return { revocata: false, codice: error.codice ?? ERR_PROVIDER };
    }
  }
}

module.exports = GoCardlessBankProvider;
