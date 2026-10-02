/**
 * L'adapter Enable Banking.
 *
 * Gira senza database: l'HTTP è una funzione finta, le credenziali sono una
 * coppia di chiavi generata qui. Serve a verificare le cose che, sbagliate,
 * non si noterebbero finché non sono già nei conti di qualcuno:
 *
 *   • il SEGNO degli importi — Enable Banking dà importi sempre positivi e
 *     la direzione in `credit_debit_indicator`, al contrario di GoCardless:
 *     sbagliarlo trasforma ogni spesa in un'entrata;
 *   • le transazioni fallite e annullate, che non devono entrare;
 *   • l'IBAN, che non deve mai uscire intero;
 *   • la chiave privata, che non deve comparire in nessun errore;
 *   • la paginazione, senza la quale mancherebbero movimenti in silenzio.
 */

const crypto = require('crypto');
const { readFileSync } = require('fs');
const { join } = require('path');
const EnableBankingProvider = require('../services/bankSync/providers/EnableBankingProvider');
const { BankProviderError } = require('../services/bankSync/providers/BankProvider');
const {
  PROVIDER_ENABLE_BANKING, TX_BOOKED, TX_PENDING,
  ERR_CONFIG, ERR_NETWORK, ERR_RATE_LIMIT, ERR_BANK_UNAVAILABLE, ERR_PROVIDER,
} = require('../constants/bankSync');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const APPLICATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** Una fetch finta che restituisce le risposte in coda e registra le chiamate. */
const creaFetch = (risposte) => {
  const chiamate = [];
  const coda = [...risposte];
  const fetchFinta = async (url, opzioni) => {
    chiamate.push({ url, opzioni, corpo: opzioni?.body ? JSON.parse(opzioni.body) : null });
    const prossima = coda.shift();
    if (!prossima) throw new Error(`Nessuna risposta preparata per ${url}`);
    if (typeof prossima === 'function') return prossima(url, opzioni);
    return {
      ok: prossima.status === undefined || (prossima.status >= 200 && prossima.status < 300),
      status: prossima.status ?? 200,
      json: async () => prossima.body,
    };
  };
  fetchFinta.chiamate = chiamate;
  return fetchFinta;
};

const creaProvider = (risposte = []) => {
  const fetchImpl = creaFetch(risposte);
  const provider = new EnableBankingProvider({
    applicationId: APPLICATION_ID,
    privateKey,
    baseUrl: 'https://api.test.invalid',
    fetchImpl,
  });
  return { provider, fetchImpl };
};

/** L'identificativo opaco di una banca, come lo produce l'adapter. */
const idBanca = (nome, paese = 'IT') => Buffer.from(`${nome}|${paese}`, 'utf8').toString('base64url');

const decodificaJwt = (header) => {
  const [h, p, firma] = header.replace('Bearer ', '').split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
    firmato: crypto.createVerify('RSA-SHA256').update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(firma, 'base64url')),
  };
};

// ═══════════════════════════════════════════════════════════════════════════
//  Configurazione e autenticazione
// ═══════════════════════════════════════════════════════════════════════════

describe('configurazione', () => {
  it('senza credenziali si dichiara non configurato e non chiama nessuno', async () => {
    const fetchImpl = creaFetch([]);
    const provider = new EnableBankingProvider({
      applicationId: null, privateKey: null, fetchImpl,
    });

    expect(provider.nome).toBe(PROVIDER_ENABLE_BANKING);
    expect(await provider.isConfigurato()).toBe(false);

    await expect(provider.listIstituti('IT')).rejects.toMatchObject({ codice: ERR_CONFIG });
    expect(fetchImpl.chiamate).toHaveLength(0);
  });

  it('una chiave malformata è un errore di configurazione, e non la rivela', async () => {
    const provider = new EnableBankingProvider({
      applicationId: APPLICATION_ID,
      privateKey: '-----BEGIN PRIVATE KEY-----\nnon-una-chiave\n-----END PRIVATE KEY-----',
      fetchImpl: creaFetch([]),
    });

    await expect(provider.listIstituti('IT')).rejects.toMatchObject({
      codice: ERR_CONFIG, statusCode: 503,
    });

    // Il contenuto della chiave non deve finire nel messaggio d'errore.
    const errore = await provider.listIstituti('IT').catch((e) => e);
    expect(errore.message).not.toMatch(/BEGIN PRIVATE KEY|non-una-chiave/);
  });

  it('firma ogni chiamata con un JWT RS256 verificabile', async () => {
    const { provider, fetchImpl } = creaProvider([{ body: { aspsps: [] } }]);
    await provider.listIstituti('IT');

    const { header, payload, firmato } = decodificaJwt(
      fetchImpl.chiamate[0].opzioni.headers.Authorization,
    );

    expect(header).toMatchObject({ typ: 'JWT', alg: 'RS256', kid: APPLICATION_ID });
    expect(payload.iss).toBe('enablebanking.com');
    expect(payload.aud).toBe('api.enablebanking.com');
    expect(payload.exp).toBeGreaterThan(payload.iat);
    // La firma è vera: un JWT non verificabile sarebbe rifiutato dal
    // provider con un 401 difficile da diagnosticare.
    expect(firmato).toBe(true);
  });

  it('riusa lo stesso JWT finché è valido invece di rifirmarlo ogni volta', async () => {
    const { provider, fetchImpl } = creaProvider([
      { body: { aspsps: [] } }, { body: { aspsps: [] } },
    ]);
    await provider.listIstituti('IT');
    await provider.listIstituti('IT');

    expect(fetchImpl.chiamate[0].opzioni.headers.Authorization)
      .toBe(fetchImpl.chiamate[1].opzioni.headers.Authorization);
  });

  it('accetta una chiave con \\n letterali, come la salva Vercel', async () => {
    const { provider: riferimento } = creaProvider([{ body: { aspsps: [] } }]);
    const fetchImpl = creaFetch([{ body: { aspsps: [] } }]);
    const provider = new EnableBankingProvider({
      applicationId: APPLICATION_ID,
      privateKey: privateKey.replace(/\n/g, '\\n'),
      baseUrl: 'https://api.test.invalid',
      fetchImpl,
    });

    await expect(provider.listIstituti('IT')).resolves.toEqual([]);
    expect(await riferimento.isConfigurato()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Istituti e autorizzazione
// ═══════════════════════════════════════════════════════════════════════════

describe('istituti e autorizzazione', () => {
  it('identifica una banca con nome e paese, in una stringa opaca per WALLT', async () => {
    const { provider } = creaProvider([{
      body: {
        aspsps: [
          { name: 'Intesa Sanpaolo', country: 'IT', logo: 'https://x/logo.png' },
          { name: 'UniCredit', country: 'IT' },
        ],
      },
    }]);

    const istituti = await provider.listIstituti('IT');
    expect(istituti).toHaveLength(2);
    expect(istituti[0]).toMatchObject({
      id: idBanca('Intesa Sanpaolo'), nome: 'Intesa Sanpaolo', paesi: ['IT'],
    });
    expect(istituti[1].id).toBe(idBanca('UniCredit'));
    // L'identificativo deve restare dentro i caratteri che
    // `validateBankConnect` ammette: è la ragione per cui è codificato.
    istituti.forEach((i) => {
      expect(i.id).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(i.id.length).toBeLessThanOrEqual(120);
    });
  });

  it('scarta le voci senza nome invece di produrre identificativi rotti', async () => {
    const { provider } = creaProvider([{
      body: { aspsps: [{ country: 'IT' }, { name: 'Banco BPM', country: 'IT' }] },
    }]);
    const istituti = await provider.listIstituti('IT');
    expect(istituti.map((i) => i.nome)).toEqual(['Banco BPM']);
  });

  it('toglie lo state dall\'URL di ritorno e lo passa come parametro', async () => {
    // Senza questo, il redirect avrebbe `state` due volte e Vue Router lo
    // consegnerebbe come array: la validazione lo rifiuterebbe.
    const { provider, fetchImpl } = creaProvider([{
      body: { url: 'https://banca.invalid/auth?x=1', authorization_id: 'auth-123' },
    }]);

    const esito = await provider.createAuthorization({
      institutionId: idBanca('Intesa Sanpaolo'),
      redirectUrl: 'https://www.wallt.it/banca/callback?state=STATO_SEGRETO',
      reference: 'STATO_SEGRETO',
    });

    const inviato = fetchImpl.chiamate[0].corpo;
    expect(inviato.redirect_url).toBe('https://www.wallt.it/banca/callback');
    expect(inviato.redirect_url).not.toMatch(/state=/);
    expect(inviato.state).toBe('STATO_SEGRETO');
    expect(inviato.aspsp).toEqual({ name: 'Intesa Sanpaolo', country: 'IT' });
    expect(inviato.access.valid_until).toEqual(expect.any(String));

    expect(esito).toMatchObject({
      providerConnectionId: 'auth-123',
      urlAutorizzazione: 'https://banca.invalid/auth?x=1',
    });
    expect(esito.consentExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ['con caratteri non ammessi', 'Intesa Sanpaolo|IT'],
    ['senza il paese', Buffer.from('SoloNome', 'utf8').toString('base64url')],
    ['con un paese implausibile', Buffer.from('Banca|ITALIA', 'utf8').toString('base64url')],
    ['vuoto', ''],
  ])('un identificativo banca %s viene rifiutato', async (_caso, institutionId) => {
    // Il primo caso è quello che rompeva davvero: l'identificativo in chiaro
    // contiene spazi e `|`, che `validateBankConnect` rifiuta prima ancora di
    // arrivare qui. Per questo l'adapter lo codifica.
    const { provider } = creaProvider([]);
    await expect(provider.createAuthorization({
      institutionId,
      redirectUrl: 'https://www.wallt.it/banca/callback?state=x',
      reference: 'x',
    })).rejects.toBeInstanceOf(BankProviderError);
  });

  it('ogni identificativo prodotto passa la validazione della rotta di collegamento', () => {
    // Il difetto trovato in produzione: l'adapter produceva `Nome|IT`, e
    // `validateBankConnect` ammette solo caratteri da identificatore.
    // Nessun collegamento sarebbe mai partito, per nessuna banca.
    //
    // La regola si legge dal sorgente del validator invece di essere
    // ricopiata qui: se qualcuno la restringe ancora, questo test se ne
    // accorge; se la allarga, resta comunque vero che gli id la rispettano.
    const sorgente = readFileSync(
      join(__dirname, '..', 'middleware', 'validation.middleware.js'),
      'utf8',
    );
    const blocco = sorgente.slice(sorgente.indexOf('const validateBankConnect'));
    const regola = blocco.match(/\.matches\(\/\^\[([^\]]+)\]\+\$\/\)/);
    expect(regola).not.toBeNull();

    const ammessi = new RegExp(`^[${regola[1]}]+$`);
    [
      'N26',
      "Banca d'Alba",
      'Crédit Agricole Cariparma',
      'Banca Patrimoni Sella & C.',
      "Cassa Rurale ed Artigiana di Cortina d'Ampezzo e delle Dolomiti",
    ].forEach((nome) => {
      const id = idBanca(nome);
      expect(id).toMatch(ammessi);
      // Il limite di lunghezza della rotta: un nome lungo non deve produrre
      // un identificativo che la validazione taglia fuori.
      expect(id.length).toBeLessThanOrEqual(120);
    });
  });

  it('una risposta di autorizzazione incompleta non diventa una connessione', async () => {
    const { provider } = creaProvider([{ body: { url: 'https://banca.invalid/auth' } }]);
    await expect(provider.createAuthorization({
      institutionId: idBanca('UniCredit'),
      redirectUrl: 'https://www.wallt.it/banca/callback?state=x',
      reference: 'x',
    })).rejects.toMatchObject({ codice: ERR_PROVIDER });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Callback
// ═══════════════════════════════════════════════════════════════════════════

describe('completamento del collegamento', () => {
  const sessione = {
    session_id: 'sess-987',
    aspsp: { name: 'Intesa Sanpaolo', country: 'IT' },
    accounts: [{
      uid: 'acc-uid-1',
      account_id: { iban: 'IT60X0542811101000000123456' },
      name: 'Conto Corrente',
      currency: 'EUR',
      product: 'XME Conto',
    }],
  };

  it('senza codice non si completa, e lo dice invece di fallire più avanti', async () => {
    const { provider, fetchImpl } = creaProvider([]);
    await expect(provider.handleCallback({ providerConnectionId: 'auth-123' }))
      .rejects.toMatchObject({ codice: ERR_PROVIDER, statusCode: 409 });
    expect(fetchImpl.chiamate).toHaveLength(0);
  });

  it('scambia il codice con una sessione e restituisce il nuovo identificatore', async () => {
    const { provider, fetchImpl } = creaProvider([
      { body: sessione },
      { body: { balances: [{ balance_type: 'ITAV', balance_amount: { amount: '1234.56', currency: 'EUR' } }] } },
    ]);

    const esito = await provider.handleCallback({ code: 'codice-di-ritorno' });

    expect(fetchImpl.chiamate[0].corpo).toEqual({ code: 'codice-di-ritorno' });
    // Il session_id sostituisce l'authorization_id: da qui in avanti è la
    // sessione l'oggetto che si interroga e si revoca.
    expect(esito.providerConnectionId).toBe('sess-987');
    expect(esito.stato).toBe('attiva');
    expect(esito.conti[0]).toMatchObject({
      providerAccountId: 'acc-uid-1',
      nome: 'Conto Corrente',
      valuta: 'EUR',
      saldo: 1234.56,
      istituto: { nome: 'Intesa Sanpaolo' },
    });
  });

  it('l\'IBAN esce sempre mascherato, mai intero', async () => {
    const { provider } = creaProvider([
      { body: sessione },
      { body: { balances: [] } },
    ]);
    const esito = await provider.handleCallback({ code: 'c' });

    expect(esito.conti[0].ibanMascherato).toBe('IT•••3456');
    expect(JSON.stringify(esito)).not.toContain('IT60X0542811101000000123456');
  });

  it('un conto senza uid viene scartato: non potrebbe mai sincronizzare', async () => {
    const { provider } = creaProvider([
      { body: { session_id: 's', accounts: [{ account_id: { iban: 'IT60X054281110100000012' } }] } },
    ]);
    await expect(provider.handleCallback({ code: 'c' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('se il saldo non è leggibile resta null, invece di diventare zero', async () => {
    // Uno zero sembrerebbe un conto svuotato: il motore deve poter lasciare
    // il saldo precedente.
    const { provider } = creaProvider([
      { body: sessione },
      { status: 500, body: {} },
    ]);
    const esito = await provider.handleCallback({ code: 'c' });
    expect(esito.conti[0].saldo).toBeNull();
  });

  it('sceglie il saldo disponibile fra quelli dichiarati dalla banca', async () => {
    const { provider } = creaProvider([
      { body: sessione },
      {
        body: {
          balances: [
            { balance_type: 'CLBD', balance_amount: { amount: '100.00', currency: 'EUR' } },
            { balance_type: 'ITAV', balance_amount: { amount: '80.00', currency: 'EUR' } },
          ],
        },
      },
    ]);
    const esito = await provider.handleCallback({ code: 'c' });
    // ITAV ha priorità su CLBD: è il saldo che l'utente vede nell'app.
    expect(esito.conti[0].saldo).toBe(80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Transazioni — il segno è la cosa che conta
// ═══════════════════════════════════════════════════════════════════════════

describe('transazioni', () => {
  const tx = (over = {}) => ({
    entry_reference: 'ref-1',
    status: 'BOOK',
    credit_debit_indicator: 'DBDT',
    transaction_amount: { amount: '42.50', currency: 'EUR' },
    booking_date: '2026-10-01',
    value_date: '2026-10-02',
    remittance_information: ['PAGAMENTO POS SUPERMERCATO'],
    creditor: { name: 'Esselunga' },
    merchant_category_code: '5411',
    ...over,
  });

  it('un addebito diventa un importo NEGATIVO', async () => {
    // Enable Banking manda sempre importi positivi: se il segno non venisse
    // applicato qui, ogni spesa entrerebbe in WALLT come un'entrata.
    const { provider } = creaProvider([{ body: { transactions: [tx()] } }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });

    expect(booked).toHaveLength(1);
    expect(booked[0].importo).toBe(-42.5);
    expect(booked[0].status).toBe(TX_BOOKED);
    expect(booked[0].valuta).toBe('EUR');
    expect(booked[0].descrizione).toBe('PAGAMENTO POS SUPERMERCATO');
    expect(booked[0].merchantName).toBe('Esselunga');
    expect(booked[0].providerTransactionId).toBe('ref-1');
  });

  it('un accredito resta POSITIVO', async () => {
    const { provider } = creaProvider([{
      body: { transactions: [tx({ credit_debit_indicator: 'CRDT', debtor: { name: 'Datore' }, creditor: null })] },
    }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked[0].importo).toBe(42.5);
    expect(booked[0].merchantName).toBe('Datore');
  });

  it('un importo già negativo con DBDT non diventa positivo', async () => {
    const { provider } = creaProvider([{
      body: { transactions: [tx({ transaction_amount: { amount: '-42.50', currency: 'EUR' } })] },
    }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked[0].importo).toBe(-42.5);
  });

  it('senza indicatore di direzione l\'importo resta null, non viene indovinato', async () => {
    const { provider } = creaProvider([{
      body: { transactions: [tx({ credit_debit_indicator: undefined })] },
    }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked[0].importo).toBeNull();
  });

  it('le transazioni in sospeso restano separate dalle contabilizzate', async () => {
    const { provider } = creaProvider([{
      body: { transactions: [tx(), tx({ status: 'PEND', entry_reference: 'ref-2' })] },
    }]);
    const { booked, pending } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked.map((t) => t.providerTransactionId)).toEqual(['ref-1']);
    expect(pending.map((t) => t.providerTransactionId)).toEqual(['ref-2']);
    expect(pending[0].status).toBe(TX_PENDING);
  });

  it('fallite e annullate NON entrano: non sono denaro che si è mosso', async () => {
    const { provider } = creaProvider([{
      body: {
        transactions: [
          tx({ status: 'FAILE', entry_reference: 'fallita' }),
          tx({ status: 'CANC', entry_reference: 'annullata' }),
          tx({ status: 'BOOK', entry_reference: 'buona' }),
        ],
      },
    }]);
    const { booked, pending } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked.map((t) => t.providerTransactionId)).toEqual(['buona']);
    expect(pending).toHaveLength(0);
  });

  it('segue la paginazione: una pagina sola perderebbe movimenti in silenzio', async () => {
    const { provider, fetchImpl } = creaProvider([
      { body: { transactions: [tx({ entry_reference: 'p1' })], continuation_key: 'K2' } },
      { body: { transactions: [tx({ entry_reference: 'p2' })] } },
    ]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });

    expect(booked.map((t) => t.providerTransactionId)).toEqual(['p1', 'p2']);
    expect(fetchImpl.chiamate[1].url).toContain('continuation_key=K2');
  });

  it('passa la finestra temporale richiesta', async () => {
    const { provider, fetchImpl } = creaProvider([{ body: { transactions: [] } }]);
    await provider.getTransactions({
      providerAccountId: 'a', dataDa: '2026-07-01', dataA: '2026-10-01',
    });
    expect(fetchImpl.chiamate[0].url).toContain('date_from=2026-07-01');
    expect(fetchImpl.chiamate[0].url).toContain('date_to=2026-10-01');
  });

  it('senza id stabile la transazione resta senza id, non ne riceve uno inventato', async () => {
    // Un id instabile è peggio di nessun id: il motore deduplica per
    // impronta, un id che cambia creerebbe duplicati a ogni sincronizzazione.
    const { provider } = creaProvider([{
      body: { transactions: [tx({ entry_reference: undefined })] },
    }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked[0].providerTransactionId).toBeNull();
  });

  it('una transazione senza descrizione utile non resta senza testo', async () => {
    const { provider } = creaProvider([{
      body: {
        transactions: [tx({
          remittance_information: [], creditor: null, debtor: null, bank_transaction_code: null,
        })],
      },
    }]);
    const { booked } = await provider.getTransactions({ providerAccountId: 'a' });
    expect(booked[0].descrizione).toBe('Operazione bancaria');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Errori e revoca
// ═══════════════════════════════════════════════════════════════════════════

describe('errori', () => {
  const casi = [
    [429, ERR_RATE_LIMIT],
    [503, ERR_BANK_UNAVAILABLE],
    [401, ERR_PROVIDER],
  ];

  it.each(casi)('HTTP %i diventa il codice %s', async (status, atteso) => {
    const { provider } = creaProvider([{ status, body: {} }]);
    await expect(provider.listIstituti('IT')).rejects.toMatchObject({ codice: atteso });
  });

  it('un problema di rete è distinto da un errore del provider', async () => {
    // Porta a un'azione diversa: "riprova", non "ricollega".
    const fetchImpl = creaFetch([() => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); }]);
    const provider = new EnableBankingProvider({
      applicationId: APPLICATION_ID, privateKey, baseUrl: 'https://api.test.invalid', fetchImpl,
    });
    await expect(provider.listIstituti('IT')).rejects.toMatchObject({
      codice: ERR_NETWORK, statusCode: 504,
    });
  });

  it('nessun errore espone la chiave privata o il JWT', async () => {
    const { provider } = creaProvider([{ status: 500, body: { detail: 'x' } }]);
    const errore = await provider.listIstituti('IT').catch((e) => e);
    const testo = `${errore.message} ${JSON.stringify(errore)}`;
    expect(testo).not.toContain('BEGIN PRIVATE KEY');
    expect(testo).not.toContain(APPLICATION_ID);
  });

  it('revocare una sessione già inesistente non fa fallire lo scollegamento', async () => {
    // Altrimenti l'utente resterebbe con una connessione che non riesce a
    // togliere.
    const { provider } = creaProvider([{ status: 404, body: {} }]);
    await expect(provider.revokeConnection({ providerConnectionId: 'sess-1' }))
      .resolves.toMatchObject({ revocata: false });
  });

  it('revocare senza identificatore è già fatto', async () => {
    const { provider, fetchImpl } = creaProvider([]);
    await expect(provider.revokeConnection({ providerConnectionId: null }))
      .resolves.toEqual({ revocata: true });
    expect(fetchImpl.chiamate).toHaveLength(0);
  });

  it('lo stato della sessione viene tradotto negli stati di WALLT', async () => {
    const { provider } = creaProvider([
      { body: { status: 'AUTHORIZED', accounts: [{ uid: 'a1' }], access: { valid_until: '2026-12-31T00:00:00Z' } } },
      { body: { status: 'EXPIRED', accounts: [] } },
      { body: { status: 'QUALCOSA_DI_NUOVO', accounts: [] } },
    ]);

    await expect(provider.getConnectionStatus({ providerConnectionId: 's' }))
      .resolves.toMatchObject({ stato: 'attiva', accountIds: ['a1'] });
    await expect(provider.getConnectionStatus({ providerConnectionId: 's' }))
      .resolves.toMatchObject({ stato: 'consenso_scaduto' });
    // Uno stato non previsto non diventa "attiva" per distrazione.
    await expect(provider.getConnectionStatus({ providerConnectionId: 's' }))
      .resolves.toMatchObject({ stato: 'sconosciuto' });
  });
});
