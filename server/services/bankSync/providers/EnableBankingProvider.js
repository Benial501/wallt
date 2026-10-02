const crypto = require('crypto');
const logger = require('../../../utils/logger');
const { BankProvider, BankProviderError, mascheraIban } = require('./BankProvider');
const {
  PROVIDER_ENABLE_BANKING, TX_BOOKED, TX_PENDING,
  ERR_NETWORK, ERR_PROVIDER, ERR_RATE_LIMIT, ERR_CONSENT_EXPIRED,
  ERR_BANK_UNAVAILABLE, ERR_CONFIG,
} = require('../../../constants/bankSync');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Enable Banking — adapter Open Banking
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Esiste perché GoCardless ha disabilitato i nuovi account Bank Account Data
 * nel luglio 2025: quell'adapter resta valido ma non è più ottenibile da
 * zero. Enable Banking ha registrazione self-service, è gratuito per uso
 * personale e valutazione, e si appoggia alla propria licenza AISP — WALLT
 * non deve diventare un TPP autorizzato.
 *
 * `ENABLE_BANKING_APPLICATION_ID` e `ENABLE_BANKING_PRIVATE_KEY` stanno SOLO
 * nelle variabili d'ambiente del server. La chiave privata non entra mai in
 * un log, in una risposta API o nel database: di questa connessione il
 * database conserva solo identificatori opachi e un IBAN mascherato.
 *
 * ── Tre differenze da GoCardless, assorbite qui ──────────────────────────
 *
 * 1. **L'autenticazione non è una coppia id/segreto.** Ogni richiesta porta
 *    un JWT RS256 firmato con la chiave privata, `kid` = id applicazione,
 *    `iss: enablebanking.com`, `aud: api.enablebanking.com`. Non esiste un
 *    endpoint di scambio token: il JWT lo firmiamo noi, a vita breve, e lo
 *    riusiamo finché è valido. Resta in memoria, mai su disco.
 *
 * 2. **Una banca si identifica con nome + paese**, non con un id opaco.
 *    L'interfaccia `BankProvider` parla di `institutionId`, quindi qui lo
 *    codifichiamo come `nome|PAESE` e lo decodifichiamo al momento
 *    dell'autorizzazione. Per il resto di WALLT resta una stringa opaca:
 *    è esattamente ciò che l'astrazione promette.
 *
 * 3. **Il ritorno dalla banca porta un `code`** da scambiare con una
 *    sessione (`POST /sessions`). GoCardless non ne ha bisogno, perché la
 *    requisition è già identificata. Il `code` arriva fino a qui attraverso
 *    `handleCallback({ code })`; senza, la connessione non si completa.
 *
 * ── Il doppio `state` ────────────────────────────────────────────────────
 * WALLT costruisce l'URL di ritorno con il proprio `state` nella query, ed
 * Enable Banking ne aggiunge uno suo al redirect. Due parametri con lo
 * stesso nome arriverebbero al client come array, e la validazione li
 * rifiuterebbe. Qui l'URL viene quindi ripulito del parametro e lo stesso
 * valore viene passato come `state` ad Enable Banking, che lo riconsegna:
 * una sola occorrenza, e il valore è quello che WALLT si aspetta.
 */

/** Scadenza del JWT che firmiamo. Breve: non è un token di sessione, è una
 * firma per questa chiamata e per quelle immediatamente successive. */
const TTL_JWT_SECONDI = 3600;
const MARGINE_JWT_MS = 60 * 1000;
const TIMEOUT_MS = 20000;

const BASE_URL_DEFAULT = 'https://api.enablebanking.com';

/** Quanto chiediamo di poter leggere. 90 giorni è anche la finestra che il
 * motore importa alla prima sincronizzazione. */
const VALIDITA_CONSENSO_GIORNI = 90;

const toNumber = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
};

/**
 * Da `status` di Enable Banking a stato WALLT.
 *
 * `FAILE` e `CANC` NON compaiono: una transazione fallita o annullata non è
 * un movimento avvenuto, e farla entrare significherebbe scrivere nel conto
 * di una persona del denaro che non si è mosso. Vengono scartate.
 */
const STATUS_TRANSAZIONE = {
  BOOK: TX_BOOKED,
  PEND: TX_PENDING,
};

/** Stato di una sessione Enable Banking → stato di connessione WALLT. */
const STATO_SESSIONE = {
  AUTHORIZED: 'attiva',
  GRANTED: 'attiva',
  ACTIVE: 'attiva',
  EXPIRED: 'consenso_scaduto',
  REVOKED: 'revocata',
  CANCELLED: 'revocata',
  REJECTED: 'revocata',
  INVALID: 'revocata',
};

/**
 * Quale saldo è "quanto c'è sul conto adesso".
 *
 * L'ordine non è arbitrario: `ITAV` (interim available) è il saldo
 * disponibile comprensivo delle operazioni non ancora contabilizzate ed è
 * quello che l'utente vede nell'app della banca; `CLAV`/`CLBD` sono i saldi
 * di chiusura. L'ultimo ripiego è la prima riga disponibile, perché un
 * saldo plausibile è meglio di nessun saldo — ma se non c'è nulla si
 * restituisce `null` e il motore lascia il saldo precedente, invece di
 * scrivere uno zero che sembrerebbe un conto svuotato.
 */
const PRIORITA_SALDO = ['ITAV', 'CLAV', 'CLBD', 'ITBD', 'OPAV', 'OPBD', 'XPCD'];

/**
 * `{ name, country }` ⇄ identificativo opaco.
 *
 * Enable Banking identifica una banca con nome e paese, non con un id. Il
 * nome però contiene spazi, apostrofi, accenti e `&` («Banca d'Alba»,
 * «Crédit Agricole Cariparma», «Banca Patrimoni Sella & C.»), mentre
 * `validateBankConnect` ammette solo caratteri da identificatore — e ha
 * ragione: quella stringa torna dal client e finisce in un URL verso il
 * provider, quindi tenerla ristretta è una difesa vera, non una formalità.
 *
 * La soluzione non è allargare il validator fino ad accogliere mezzo
 * alfabeto, ma rendere l'identificativo ciò che dichiara di essere: opaco.
 * base64url produce esattamente `[A-Za-z0-9_-]`, il nome resta leggibile
 * solo dall'adapter, e il resto di WALLT continua a trattarlo come una
 * stringa di cui non sa nulla.
 */
const codificaIstituto = (name, country) => Buffer
  .from(`${name}|${String(country || '').toUpperCase()}`, 'utf8')
  .toString('base64url');

const decodificaIstituto = (institutionId) => {
  const nonValido = () => new BankProviderError(
    ERR_PROVIDER,
    'Identificativo banca non valido per Enable Banking',
    { statusCode: 400 },
  );

  const grezzo = String(institutionId || '');
  if (!grezzo || !/^[A-Za-z0-9_-]+$/.test(grezzo)) throw nonValido();

  let decodificato;
  try {
    decodificato = Buffer.from(grezzo, 'base64url').toString('utf8');
  } catch {
    throw nonValido();
  }

  const taglio = decodificato.lastIndexOf('|');
  if (taglio <= 0) throw nonValido();

  const country = decodificato.slice(taglio + 1).toUpperCase();
  // Due lettere esatte: un paese più lungo significa che la stringa non è
  // quella che abbiamo prodotto noi.
  if (!/^[A-Z]{2}$/.test(country)) throw nonValido();

  return { name: decodificato.slice(0, taglio), country };
};

class EnableBankingProvider extends BankProvider {
  constructor({
    applicationId = process.env.ENABLE_BANKING_APPLICATION_ID,
    privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY,
    baseUrl = process.env.ENABLE_BANKING_BASE_URL || BASE_URL_DEFAULT,
    fetchImpl = globalThis.fetch,
  } = {}) {
    super();
    this._applicationId = applicationId;
    // Vercel e i file .env conservano la chiave su una riga sola con `\n`
    // letterali: senza questa conversione `crypto` rifiuta il PEM con un
    // errore che non dice perché.
    this._privateKey = typeof privateKey === 'string'
      ? privateKey.replace(/\\n/g, '\n').trim()
      : privateKey;
    this._baseUrl = String(baseUrl).replace(/\/+$/, '');
    this._fetch = fetchImpl;
    /** @type {{valore: string, scadenza: number}|null} in memoria, mai su disco */
    this._jwt = null;
  }

  get nome() { return PROVIDER_ENABLE_BANKING; }

  async isConfigurato() {
    return !!(this._applicationId && this._privateKey);
  }

  _assertConfigurato() {
    if (!this._applicationId || !this._privateKey) {
      throw new BankProviderError(
        ERR_CONFIG,
        'ENABLE_BANKING_APPLICATION_ID / ENABLE_BANKING_PRIVATE_KEY non configurati',
        { statusCode: 503 },
      );
    }
  }

  /**
   * Il JWT con cui si firma ogni chiamata.
   *
   * Lo firmiamo noi: non c'è nessun endpoint da interrogare, quindi nessuna
   * credenziale viaggia mai in rete — a differenza di GoCardless, dove la
   * coppia segreta va spedita per ottenere un access token.
   */
  _token() {
    this._assertConfigurato();
    if (this._jwt && this._jwt.scadenza - MARGINE_JWT_MS > Date.now()) {
      return this._jwt.valore;
    }

    const adesso = Math.floor(Date.now() / 1000);
    const header = { typ: 'JWT', alg: 'RS256', kid: this._applicationId };
    const payload = {
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: adesso,
      exp: adesso + TTL_JWT_SECONDI,
    };
    const base64url = (oggetto) => Buffer.from(JSON.stringify(oggetto)).toString('base64url');
    const corpo = `${base64url(header)}.${base64url(payload)}`;

    let firma;
    try {
      firma = crypto.createSign('RSA-SHA256').update(corpo).sign(this._privateKey, 'base64url');
    } catch (error) {
      // Chiave malformata: è un errore di configurazione, non del provider.
      // Il contenuto della chiave non finisce nel messaggio.
      throw new BankProviderError(
        ERR_CONFIG,
        `Chiave privata Enable Banking non utilizzabile (${error.code || error.name})`,
        { statusCode: 503 },
      );
    }

    const valore = `${corpo}.${firma}`;
    this._jwt = { valore, scadenza: (adesso + TTL_JWT_SECONDI) * 1000 };
    return valore;
  }

  /** Traduce una risposta HTTP in un errore con un codice che WALLT sa
   * interpretare. Il corpo grezzo resta nei log, già sanitizzati. */
  // eslint-disable-next-line class-methods-use-this
  _erroreDaRisposta(risposta, contesto) {
    const stato = risposta.status;
    let codice = ERR_PROVIDER;
    if (stato === 429) codice = ERR_RATE_LIMIT;
    else if (stato === 401 || stato === 403) codice = ERR_PROVIDER;
    else if (stato === 410) codice = ERR_CONSENT_EXPIRED;
    else if (stato === 422) codice = ERR_PROVIDER;
    else if (stato >= 500) codice = ERR_BANK_UNAVAILABLE;

    logger.warn('Risposta non valida dal provider bancario', {
      provider: PROVIDER_ENABLE_BANKING, contesto, http_status: stato,
    });
    return new BankProviderError(codice, `EnableBanking ${contesto}: HTTP ${stato}`, {
      statusCode: codice === ERR_RATE_LIMIT ? 429 : 502,
    });
  }

  async _richiesta(percorso, { metodo = 'GET', corpo = null, contesto } = {}) {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${this._token()}`,
    };
    if (corpo) headers['Content-Type'] = 'application/json';

    let risposta;
    try {
      risposta = await this._fetch(`${this._baseUrl}${percorso}`, {
        method: metodo,
        headers,
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // Rete o timeout: porta a "riprova", non a "ricollega".
      throw new BankProviderError(ERR_NETWORK, `EnableBanking ${contesto}: rete non raggiungibile`, {
        statusCode: 504, causa: error.name,
      });
    }

    if (risposta.status === 204) return null;
    if (!risposta.ok) throw this._erroreDaRisposta(risposta, contesto);

    try {
      return await risposta.json();
    } catch {
      throw new BankProviderError(ERR_PROVIDER, `EnableBanking ${contesto}: risposta non interpretabile`);
    }
  }

  async listIstituti(paese = 'IT') {
    const codice = String(paese || 'IT').toUpperCase().slice(0, 2);
    const dati = await this._richiesta(
      `/aspsps?country=${encodeURIComponent(codice)}`,
      { contesto: 'aspsps' },
    );

    const elenco = Array.isArray(dati?.aspsps) ? dati.aspsps : (Array.isArray(dati) ? dati : []);
    return elenco
      .filter((a) => a && typeof a.name === 'string')
      .map((a) => ({
        id: codificaIstituto(a.name, a.country || codice),
        nome: a.name,
        logo: a.logo ?? null,
        paesi: [String(a.country || codice).toUpperCase()],
        // `maximum_consent_validity` è in secondi quando c'è. Il motore lo
        // usa solo per dire all'utente quanto durerà il collegamento.
        giorni_storico: a.maximum_consent_validity
          ? Math.max(1, Math.round(toNumber(a.maximum_consent_validity) / 86400))
          : VALIDITA_CONSENSO_GIORNI,
      }));
  }

  async createAuthorization({ institutionId, redirectUrl, reference }) {
    const aspsp = decodificaIstituto(institutionId);

    // Vedi la nota "Il doppio `state`" in testa al file: l'URL di ritorno
    // viene ripulito e lo stesso valore viaggia come `state`, che Enable
    // Banking riconsegna. Così al client arriva una sola occorrenza.
    let urlPulito = redirectUrl;
    let stato = reference;
    try {
      const u = new URL(redirectUrl);
      const nelleQuery = u.searchParams.get('state');
      if (nelleQuery) stato = nelleQuery;
      u.searchParams.delete('state');
      urlPulito = u.toString();
    } catch {
      // Un redirect non parsabile è un errore di configurazione di WALLT
      // (APP_URL), non del provider: meglio dirlo che mandarlo alla banca.
      throw new BankProviderError(ERR_CONFIG, 'URL di ritorno non valido', { statusCode: 500 });
    }

    const validoFino = new Date(Date.now() + VALIDITA_CONSENSO_GIORNI * 24 * 60 * 60 * 1000);

    const dati = await this._richiesta('/auth', {
      metodo: 'POST',
      corpo: {
        access: { valid_until: validoFino.toISOString() },
        aspsp,
        state: stato,
        redirect_url: urlPulito,
        psu_type: 'personal',
        // Minuscolo: l'API valida con `^[a-z]{2}$` e rifiuta `IT` con un
        // 422. Verificato contro l'API reale — la documentazione dice solo
        // "language: string".
        language: 'it',
      },
      contesto: 'auth',
    });

    if (!dati?.url || !dati?.authorization_id) {
      throw new BankProviderError(ERR_PROVIDER, 'EnableBanking auth: risposta incompleta');
    }

    return {
      providerConnectionId: dati.authorization_id,
      urlAutorizzazione: dati.url,
      consentCreatedAt: new Date(),
      consentExpiresAt: validoFino,
    };
  }

  /**
   * Completa l'autorizzazione scambiando il `code` con una sessione.
   *
   * Restituisce un `providerConnectionId` NUOVO — il `session_id` — che
   * sostituisce l'`authorization_id` salvato al momento del collegamento:
   * da qui in avanti è la sessione l'oggetto che WALLT interroga e revoca.
   * È il motivo per cui `handleCallback` può cambiare quell'identificatore.
   */
  async handleCallback({ code }) {
    if (!code || typeof code !== 'string') {
      throw new BankProviderError(
        ERR_PROVIDER,
        'EnableBanking callback: codice di autorizzazione mancante',
        { statusCode: 409 },
      );
    }

    const dati = await this._richiesta('/sessions', {
      metodo: 'POST',
      corpo: { code },
      contesto: 'sessions',
    });

    if (!dati?.session_id) {
      throw new BankProviderError(ERR_PROVIDER, 'EnableBanking sessions: risposta senza sessione', { statusCode: 409 });
    }

    const conti = this._contiDaSessione(dati);
    if (conti.length === 0) {
      throw new BankProviderError(ERR_PROVIDER, 'La banca non ha restituito nessun conto', { statusCode: 409 });
    }

    // I saldi non arrivano con la sessione: si leggono per conto. Solo per
    // il primo, che è quello che WALLT collega (un conto per utente).
    const [primo] = conti;
    primo.saldo = await this._saldoDiConto(primo.providerAccountId);

    return {
      stato: 'attiva',
      providerConnectionId: dati.session_id,
      conti,
    };
  }

  /** I conti dichiarati da una sessione, nella forma normalizzata. */
  // eslint-disable-next-line class-methods-use-this
  _contiDaSessione(sessione) {
    const grezzi = Array.isArray(sessione?.accounts) ? sessione.accounts : [];
    const nomeIstituto = sessione?.aspsp?.name ?? null;

    return grezzi
      .map((a) => {
        // `uid` è l'identificatore con cui si interrogano saldi e movimenti.
        // Senza, il conto è inutilizzabile: va scartato invece di creare una
        // connessione che non potrà mai sincronizzare.
        const uid = a?.uid ?? a?.account_uid ?? null;
        if (!uid) return null;
        const iban = a?.account_id?.iban ?? a?.iban ?? null;
        return {
          providerAccountId: String(uid),
          nome: a?.name || a?.product || null,
          ibanMascherato: mascheraIban(iban),
          valuta: typeof a?.currency === 'string' ? a.currency.slice(0, 3) : null,
          saldo: null,
          istituto: { id: null, nome: nomeIstituto },
        };
      })
      .filter(Boolean);
  }

  /** Il saldo di un conto, o `null` se la banca non lo dichiara o la
   * lettura fallisce: il motore lascia allora il saldo precedente invece di
   * azzerarlo. */
  async _saldoDiConto(providerAccountId) {
    try {
      const dati = await this._richiesta(
        `/accounts/${encodeURIComponent(providerAccountId)}/balances`,
        { contesto: 'balances' },
      );
      return this._saldoDaBalances(dati);
    } catch (error) {
      logger.warn('Saldo non disponibile dal provider bancario', {
        provider: PROVIDER_ENABLE_BANKING, codice: error.codice ?? null,
      });
      return null;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _saldoDaBalances(dati) {
    const elenco = Array.isArray(dati?.balances) ? dati.balances : [];
    if (elenco.length === 0) return null;
    const perTipo = (tipo) => elenco.find((b) => b?.balance_type === tipo);
    const scelto = PRIORITA_SALDO.map(perTipo).find(Boolean) || elenco[0];
    return toNumber(scelto?.balance_amount?.amount);
  }

  async getAccounts({ accountIds = [] }) {
    const conti = [];
    for (const accountId of accountIds) {
      // In serie: il provider applica limiti per conto, e un utente ne
      // collega uno solo. La latenza non vale il rischio di un 429.
      // eslint-disable-next-line no-await-in-loop
      const saldo = await this._saldoDiConto(accountId);
      conti.push({
        providerAccountId: accountId,
        nome: null,
        ibanMascherato: null,
        valuta: null,
        saldo,
        istituto: { id: null, nome: null },
      });
    }
    return conti;
  }

  async getConnectionStatus({ providerConnectionId }) {
    const dati = await this._richiesta(
      `/sessions/${encodeURIComponent(providerConnectionId)}`,
      { contesto: 'session-status' },
    );
    const grezzo = dati?.status ?? null;
    return {
      stato: STATO_SESSIONE[grezzo] ?? 'sconosciuto',
      statoProvider: grezzo,
      accountIds: Array.isArray(dati?.accounts)
        ? dati.accounts.map((a) => (typeof a === 'string' ? a : a?.uid)).filter(Boolean)
        : [],
      consentExpiresAt: dati?.access?.valid_until ? new Date(dati.access.valid_until) : null,
    };
  }

  /**
   * Le transazioni di un conto nella finestra richiesta.
   *
   * `continuation_key` viene seguita: senza, su un conto movimentato si
   * importerebbe solo la prima pagina e mancherebbero movimenti senza che
   * nulla segnali l'ammanco. Il numero di pagine è limitato, perché una
   * risposta che non finisce mai è un modo per restare appesi.
   */
  async getTransactions({ providerAccountId, dataDa, dataA }) {
    const booked = [];
    const pending = [];
    let continuation = null;
    let pagine = 0;

    do {
      const parametri = new URLSearchParams();
      if (dataDa) parametri.set('date_from', dataDa);
      if (dataA) parametri.set('date_to', dataA);
      if (continuation) parametri.set('continuation_key', continuation);
      const query = parametri.toString() ? `?${parametri.toString()}` : '';

      // eslint-disable-next-line no-await-in-loop
      const dati = await this._richiesta(
        `/accounts/${encodeURIComponent(providerAccountId)}/transactions${query}`,
        { contesto: 'transactions' },
      );

      const grezze = Array.isArray(dati?.transactions) ? dati.transactions : [];
      grezze.forEach((t) => {
        const stato = STATUS_TRANSAZIONE[t?.status];
        // Fallite e annullate non sono movimenti avvenuti: scartarle è il
        // punto, non una svista.
        if (!stato) return;
        const normalizzata = this._normalizzaTransazione(t, stato);
        (stato === TX_BOOKED ? booked : pending).push(normalizzata);
      });

      continuation = dati?.continuation_key ?? null;
      pagine += 1;
    } while (continuation && pagine < 20);

    if (continuation) {
      logger.warn('Pagine di transazioni troncate dal limite di sicurezza', {
        provider: PROVIDER_ENABLE_BANKING, pagine,
      });
    }

    return { booked, pending, saldo: null };
  }

  /**
   * Da transazione Enable Banking a `ProviderTransaction`.
   *
   * ── Il segno ─────────────────────────────────────────────────────────
   * Qui sta la differenza che conta rispetto a GoCardless. Enable Banking
   * dà `transaction_amount` sempre POSITIVO e la direzione in
   * `credit_debit_indicator` (`CRDT` entrata, `DBDT` uscita). Il contratto
   * di `ProviderTransaction` vuole invece l'importo firmato come lo dà la
   * banca, negativo per le uscite: la conversione va fatta qui, perché
   * `normalizer.js` traduce il segno in entrata/uscita e non sa nulla di
   * indicatori. Dimenticarla trasformerebbe ogni spesa in un'entrata.
   *
   * Un indicatore assente o sconosciuto NON viene indovinato: l'importo
   * resta `null` e il motore scarta la riga, perché una transazione di cui
   * non si conosce la direzione è peggio di una transazione mancante.
   */
  // eslint-disable-next-line class-methods-use-this
  _normalizzaTransazione(t, status) {
    const indicatore = typeof t?.credit_debit_indicator === 'string'
      ? t.credit_debit_indicator.toUpperCase() : null;
    const grezzo = toNumber(t?.transaction_amount?.amount);

    let importo = null;
    if (grezzo !== null && (indicatore === 'CRDT' || indicatore === 'DBDT')) {
      importo = indicatore === 'DBDT' ? -Math.abs(grezzo) : Math.abs(grezzo);
    }

    const controparte = t?.creditor?.name || t?.debtor?.name || null;
    const riferimenti = Array.isArray(t?.remittance_information)
      ? t.remittance_information.filter((r) => typeof r === 'string' && r.trim()).join(' ')
      : null;

    const descrizione = [riferimenti, t?.bank_transaction_code?.description, controparte]
      .find((v) => typeof v === 'string' && v.trim().length > 0) || 'Operazione bancaria';

    return {
      // `entry_reference` è l'identificatore stabile. Se manca, la riga
      // resta senza id e il motore la dedupla per impronta: non inventiamo
      // un id, perché un id instabile è peggio di nessun id.
      providerTransactionId: t?.entry_reference || t?.transaction_id || null,
      status,
      importo,
      valuta: typeof t?.transaction_amount?.currency === 'string'
        ? t.transaction_amount.currency.slice(0, 3) : null,
      bookingDate: t?.booking_date || t?.transaction_date || t?.value_date || null,
      valueDate: t?.value_date || t?.booking_date || t?.transaction_date || null,
      descrizione: String(descrizione).trim().slice(0, 500),
      merchantName: controparte ? String(controparte).trim().slice(0, 200) : null,
      controparte,
      categoriaProvider: t?.merchant_category_code || t?.bank_transaction_code?.code || null,
    };
  }

  async refreshConnection({ institutionId, redirectUrl, reference }) {
    // Un consenso scaduto non si rinnova: si riautorizza. Dirlo qui, e non
    // al chiamante, è il punto dell'astrazione.
    return this.createAuthorization({ institutionId, redirectUrl, reference });
  }

  async revokeConnection({ providerConnectionId }) {
    if (!providerConnectionId) return { revocata: true };
    try {
      await this._richiesta(`/sessions/${encodeURIComponent(providerConnectionId)}`, {
        metodo: 'DELETE',
        contesto: 'session-delete',
      });
      return { revocata: true };
    } catch (error) {
      // Una sessione già inesistente non è un errore da propagare: lo scopo
      // dello scollegamento è raggiunto comunque, e fallire lascerebbe
      // l'utente con una connessione che non riesce a togliere.
      logger.warn('Revoca consenso presso il provider non confermata', {
        provider: PROVIDER_ENABLE_BANKING, codice: error.codice ?? null,
      });
      return { revocata: false, codice: error.codice ?? ERR_PROVIDER };
    }
  }
}

module.exports = EnableBankingProvider;
module.exports.codificaIstituto = codificaIstituto;
module.exports.decodificaIstituto = decodificaIstituto;
