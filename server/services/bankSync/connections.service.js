const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, BankConnection, Conto, Movimento,
} = require('../../models');
const logger = require('../../utils/logger');
const {
  STATO_IN_ATTESA, STATO_DA_RICONCILIARE, STATO_ATTIVA, STATO_CONSENSO_SCADUTO,
  STATO_ERRORE, STATO_SOSPESA_ENTITLEMENT, STATO_REVOCATA, STATI_VIVI,
  STATI_SINCRONIZZABILI, STATE_TTL_MINUTI, ERRORI_RICHIEDONO_RICONNESSIONE,
  ORIGINE_OPEN_BANKING, ERR_CONFIG, DESTINAZIONE_NUOVO,
} = require('../../constants/bankSync');
const { getBankProvider } = require('./providers');
const { BankProviderError } = require('./providers/BankProvider');
const { aggiornaSaldoConto } = require('../scommesseContoSync.service');
const { registraAudit, EVENTI, ESITI } = require('../auditLog.service');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Ciclo di vita di una connessione bancaria
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quattro garanzie, tutte applicate dal server e nessuna lasciata alla UI:
 *
 *  1. UN SOLO conto sincronizzato per utente. L'indice parziale
 *     `bank_connections_una_viva_per_utente` lo impone nel database: due
 *     richieste simultanee passerebbero entrambe un controllo applicativo, e
 *     solo l'indice le ferma. Qui il controllo esiste per dare un messaggio
 *     sensato prima di sbatterci contro, non come barriera.
 *
 *  2. IL CALLBACK È PROTETTO. Lo `state` è casuale (32 byte), conservato solo
 *     come SHA-256, a scadenza e monouso, e deve appartenere all'utente
 *     autenticato che lo presenta. L'identità non viene MAI dedotta da un
 *     parametro della richiesta: `user_id` arriva dal JWT verificato, e lo
 *     `state` serve a collegare quella sessione a quel tentativo. Chi
 *     intercettasse o indovinasse uno `state` non potrebbe usarlo, perché
 *     verrebbe confrontato con il proprietario della sessione.
 *
 *  3. LO STORICO NON SI PERDE. Scollegare, sostituire o far scadere una
 *     connessione non cancella un solo movimento: la riga della connessione
 *     resta (stato `revocata`) e i movimenti continuano a referenziarla
 *     (`ON DELETE SET NULL`, non CASCADE). Cancellare i dati importati è una
 *     seconda azione, esplicita, separata e dietro riverifica d'identità.
 *
 *  4. NESSUNA CREDENZIALE BANCARIA. L'utente autentica sul dominio della sua
 *     banca; WALLT riceve identificatori opachi e un IBAN già mascherato.
 */

/** I tipi di conto che non possono ricevere un flusso bancario.
 * `emergenza` non ammette entrate o uscite dirette (Regola 22);
 * `scommesse` è già sincronizzato con le piattaforme (Regola 5). */
const TIPI_NON_AGGANCIABILI = ['emergenza', 'scommesse'];

/** Finestra di validità dello `state`. */
const scadenzaState = () => new Date(Date.now() + STATE_TTL_MINUTI * 60 * 1000);

const hashState = (state) => crypto.createHash('sha256').update(String(state)).digest('hex');

/** L'URL a cui la banca rimanda l'utente. Lo `state` viaggia nella query
 * perché la SPA lo rilegga e lo rimandi al server con il proprio JWT: in
 * questo modo il completamento richiede la sessione, e un link costruito da
 * un sito terzo non può portare a termine un collegamento. */
const redirectCallback = (state) => {
  const base = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/banca/callback?state=${encodeURIComponent(state)}`;
};

/** La connessione viva dell'utente, se esiste. Al massimo una: l'indice
 * parziale lo garantisce. */
const trovaConnessioneViva = (userId, { transaction, lock = false } = {}) => BankConnection.findOne({
  where: { user_id: userId, status: { [Op.in]: STATI_VIVI } },
  transaction,
  ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
});

/**
 * Chiude i tentativi abbandonati: una connessione `in_attesa` il cui `state`
 * è scaduto viene marcata `revocata`, liberando il posto.
 *
 * Senza questo, chi chiude la pagina della banca a metà resterebbe bloccato
 * per sempre dal limite di una connessione, senza avere nulla da scollegare.
 */
async function liberaTentativiScaduti(userId, { transaction } = {}) {
  const [quante] = await BankConnection.update(
    { status: STATO_REVOCATA, state_hash: null },
    {
      where: {
        user_id: userId,
        status: STATO_IN_ATTESA,
        state_expires_at: { [Op.lt]: new Date() },
      },
      transaction,
    },
  );
  return quante;
}

/** Una connessione nella forma esposta dall'API. Mai identificatori del
 * provider, mai IBAN completo, mai hash: al client serve riconoscere il
 * proprio conto e sapere cosa può fare. */
const serializza = (c, { conto = null } = {}) => (c ? {
  id: c.id,
  stato: c.status,
  provider: c.provider,
  istituto: { id: c.institution_id, nome: c.institution_name },
  conto_id: c.conto_id,
  conto_nome: conto?.nome ?? null,
  saldo: conto ? Number(conto.saldo) : (c.saldo_provider === null ? null : Number(c.saldo_provider)),
  iban_mascherato: c.iban_mascherato,
  valuta: c.valuta,
  consenso_scade_il: c.consent_expires_at,
  ultima_sincronizzazione: c.last_successful_sync_at,
  ultimo_tentativo: c.last_sync_at,
  ultimo_errore_il: c.last_error_at,
  codice_errore: c.error_code,
  richiede_riconnessione: ERRORI_RICHIEDONO_RICONNESSIONE.includes(c.error_code)
    || c.status === STATO_CONSENSO_SCADUTO,
  sincronizzabile: STATI_SINCRONIZZABILI.includes(c.status),
  sincronizzazione_in_corso: !!c.sync_started_at,
  metriche: {
    sync_riuscite: c.sync_ok_totali,
    sync_fallite: c.sync_errori_totali,
    movimenti_importati: c.movimenti_importati_totali,
    duplicati_evitati: c.duplicati_evitati_totali,
  },
} : null);

/** Lo stato per `GET /bank-sync/status`. */
async function statoConnessione(userId) {
  await liberaTentativiScaduti(userId);
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione) return { connessione: null };

  const conto = connessione.conto_id
    ? await Conto.findOne({ where: { id: connessione.conto_id, user_id: userId } })
    : null;

  return { connessione: serializza(connessione, { conto }) };
}

/**
 * I conti che la banca espone per questa autorizzazione.
 *
 * Due chiamate al provider, non una: `getAccounts` vuole gli id dei conti,
 * non l'id della connessione, e quegli id si ottengono solo da
 * `getConnectionStatus`. La sequenza vive QUI e non in due punti: sia
 * l'elenco da mostrare (`datiRiconciliazione`) sia la verifica del conto
 * scelto (`completaRiconciliazione`) devono guardare esattamente la stessa
 * lista, altrimenti un conto potrebbe comparire nell'una e non nell'altra.
 *
 * I conti vengono RILETTI dal provider a ogni chiamata invece di essere
 * persistiti al callback: sono dati provvisori, e una colonna che li conserva
 * invecchia.
 */
async function contiDellaBanca(connessione, provider = null) {
  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });
  const stato = await adapter.getConnectionStatus({
    providerConnectionId: connessione.provider_connection_id,
  });
  return adapter.getAccounts({ accountIds: stato.accountIds });
}

/**
 * Quanto serve all'utente per decidere a quale conto appartengono i movimenti
 * della banca appena autorizzata.
 *
 * I conti della banca li legge `contiDellaBanca`, dal provider e non dal
 * database. Se il provider non risponde, l'utente vede un errore e ritenta;
 * la connessione resta `da_riconciliare` e non si perde nulla (la guardia
 * iniziale non la tocca).
 *
 * Questa rotta NON dice se esistono movimenti preesistenti, benché sarebbe
 * comodo al client: quel predicato decide se fermare un'importazione e vive
 * in un posto solo, la guardia di `sincronizza`.
 */
async function datiRiconciliazione(userId, { provider = null } = {}) {
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione || connessione.status !== STATO_DA_RICONCILIARE) {
    throw Object.assign(
      new Error('Nessun collegamento in attesa di essere associato a un conto.'),
      { statusCode: 409, codice: 'nessuna_riconciliazione_pendente' },
    );
  }

  const contiBanca = await contiDellaBanca(connessione, provider);

  const contiWallt = await Conto.findAll({
    where: {
      user_id: userId,
      attivo: true,
      tipo: { [Op.notIn]: TIPI_NON_AGGANCIABILI },
    },
    order: [['ordine', 'ASC']],
  });

  return {
    conti_banca: contiBanca.map((c) => ({
      provider_account_id: c.providerAccountId,
      nome: c.nome,
      iban_mascherato: c.ibanMascherato,
      valuta: c.valuta,
      saldo: c.saldo,
    })),
    conti_wallt: contiWallt.map((c) => ({
      id: c.id, nome: c.nome, tipo: c.tipo, saldo: c.saldo,
    })),
  };
}

/**
 * Associa la connessione autorizzata a un conto WALLT.
 *
 * Agganciare un conto esistente NON elimina e NON archivia nulla: quel conto
 * diventa lui il conto collegato. Stesso id, stesso nome, stessi movimenti;
 * cambia soltanto da dove arrivano quelli nuovi. La banca restituisce 90
 * giorni e lo storico manuale può coprirne nove mesi: sostituire il conto
 * distruggerebbe dati che nessuna fonte è in grado di restituire.
 *
 * Il saldo di un conto esistente non viene toccato qui: lo allinea la prima
 * sincronizzazione (`allineaSaldo`), che è già l'unico punto che fa quel
 * lavoro. Un solo proprietario di quella scrittura invece di due.
 *
 * @param {Object} dati
 * @param {number} dati.userId
 * @param {string} dati.providerAccountId  il conto della banca, verificato
 *   contro quelli che questa autorizzazione espone davvero
 * @param {'nuovo'|number} dati.destinazione
 * @param {import('./providers/BankProvider').BankProvider} [dati.provider]
 */
async function completaRiconciliazione({
  userId, providerAccountId, destinazione, provider = null,
}) {
  // La connessione si trova dall'utente autenticato, mai da un id nel corpo
  // della richiesta: è lo stesso principio che protegge il callback.
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione) {
    throw Object.assign(new Error('Nessun collegamento bancario da associare.'), {
      statusCode: 409, codice: 'nessuna_riconciliazione_pendente',
    });
  }

  /** Il lavoro era già fatto: si restituisce lo stato corrente, non un 409.
   * Un doppio click o un refresh non sono un errore dell'utente. */
  const giaFatto = async (c, transaction = undefined) => {
    const conto = await Conto.findOne({
      where: { id: c.conto_id, user_id: userId },
      ...(transaction ? { transaction } : {}),
    });
    return { connessione: serializza(c, { conto }), conto, creato: false };
  };

  const nonPendente = () => Object.assign(
    new Error('Questo collegamento non è in attesa di associazione.'),
    { statusCode: 409, codice: 'nessuna_riconciliazione_pendente' },
  );

  // Verifica a buon mercato, prima di chiamare il provider: una ripetizione
  // non deve costargli quota. Non è la barriera — quella è il lock qui sotto.
  if (connessione.status === STATO_ATTIVA && connessione.conto_id) {
    return giaFatto(connessione);
  }
  if (connessione.status !== STATO_DA_RICONCILIARE) throw nonPendente();

  // Il conto bancario si prende dalla sessione, mai dal corpo della
  // richiesta: un id arrivato dal client non è una prova che quel conto
  // appartenga a questa autorizzazione.
  const contiBanca = await contiDellaBanca(connessione, provider);
  const scelto = contiBanca.find((c) => c.providerAccountId === providerAccountId);
  if (!scelto) {
    throw Object.assign(new Error('Il conto indicato non appartiene a questo collegamento.'), {
      statusCode: 422, codice: 'conto_banca_non_valido',
    });
  }

  return sequelize.transaction(async (transaction) => {
    // La connessione viene RILETTA dentro la transazione e BLOCCATA. Fra la
    // verifica qui sopra e questa scrittura può infilarsi un'altra richiesta
    // (doppio click, due schede aperte): senza il lock due richieste
    // simultanee creerebbero due conti, la connessione ne terrebbe uno solo
    // e l'altro resterebbe orfano nel patrimonio dell'utente — cioè
    // esattamente il doppio conteggio che questa rotta esiste per evitare.
    // "Controlla e poi inserisci" non è atomico (Coding Rule 22).
    const viva = await trovaConnessioneViva(userId, { transaction, lock: true });
    if (!viva) throw nonPendente();
    if (viva.status === STATO_ATTIVA && viva.conto_id) return giaFatto(viva, transaction);
    if (viva.status !== STATO_DA_RICONCILIARE) throw nonPendente();

    let conto;
    let creato = false;

    if (destinazione === DESTINAZIONE_NUOVO) {
      const maxOrdine = await Conto.max('ordine', { where: { user_id: userId }, transaction });
      // `Conto.create` e NON `createConto` (conti.controller.js): quel
      // percorso genera un movimento «Saldo iniziale» quando il saldo è
      // positivo, e per un conto bancario sarebbe un'ENTRATA INVENTATA —
      // falserebbe le medie di reddito, i budget e Piano Smart. Per un conto
      // sincronizzato la verità sul saldo la dice la banca, non un movimento.
      // Chi "semplifica" questo punto passando da `createConto` rimette in
      // circolo quel difetto.
      conto = await Conto.create({
        user_id: userId,
        // La banca prima dell'intestatario: Enable Banking mette in `name`
        // il nome del titolare, e «Christian Maiolo» non è il nome di un
        // conto. Rinominarlo resta possibile da `PUT /conti/:id`.
        nome: viva.institution_name || scelto.nome || 'Conto bancario',
        tipo: 'banca',
        // Su un conto nuovo il saldo iniziale lo mette la creazione: non c'è
        // nessuno storico da preservare e la banca è l'unica fonte.
        saldo: scelto.saldo ?? 0,
        // Identificatore d'icona, non un'emoji: il client traduce gli id
        // (`client/src/utils/contoIcons.js`) e tratta le emoji come valori
        // storici da normalizzare.
        icona: 'banca',
        colore: '#74B9FF',
        ordine: (maxOrdine || 0) + 1,
        attivo: true,
        nascosto: false,
      }, { transaction });
      creato = true;
    } else {
      conto = await Conto.findOne({
        where: { id: destinazione, user_id: userId, attivo: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      // Il conto di un altro utente è indistinguibile da un conto che non
      // esiste: il filtro per `user_id` è nella query, non in un controllo
      // successivo.
      if (!conto) {
        throw Object.assign(new Error('Conto non trovato'), { statusCode: 404 });
      }
      if (TIPI_NON_AGGANCIABILI.includes(conto.tipo)) {
        throw Object.assign(
          new Error('Questo conto non può essere collegato a una banca.'),
          { statusCode: 422, codice: 'conto_non_agganciabile' },
        );
      }
    }

    const aggiornata = await viva.update({
      conto_id: conto.id,
      provider_account_id: providerAccountId,
      iban_mascherato: scelto.ibanMascherato ?? null,
      valuta: scelto.valuta ?? null,
      // Il saldo dichiarato dalla banca si registra sulla CONNESSIONE, dove
      // descrive la fonte. Sul conto esistente non si scrive: lì la prima
      // sincronizzazione è l'unica a decidere.
      saldo_provider: scelto.saldo ?? null,
      status: STATO_ATTIVA,
    }, { transaction });

    // La traccia della transizione `da_riconciliare → attiva`: è il momento in
    // cui si decide dove finiranno i movimenti di quella banca, e senza
    // registrarlo non sarebbe ricostruibile né quando una connessione è
    // diventata operativa né a quale conto è legata.
    //
    // Dentro la transazione di proposito: se la scrittura del conto o della
    // connessione viene annullata, non deve restare un evento che racconta
    // un'associazione mai avvenuta.
    //
    // Nei metadata solo identificatori e un booleano. NESSUN importo, NESSUN
    // saldo, NESSUN IBAN, nemmeno mascherato: la Regola 17 vale anche per
    // l'audit, e `audit_logs` è leggibile dall'area amministrativa.
    await registraAudit({
      userId,
      evento: EVENTI.CONNESSIONE_ASSOCIATA,
      entita: 'bank_connection',
      entitaId: viva.id,
      metadata: {
        institution_id: viva.institution_id,
        conto_id: conto.id,
        conto_creato: creato,
      },
      transaction,
    });

    return { connessione: serializza(aggiornata, { conto }), conto, creato };
  });
}

/** Le banche disponibili, dal provider configurato. */
async function istitutiDisponibili({ paese = 'IT', provider = null } = {}) {
  const adapter = provider ?? await getBankProvider();
  if (!await adapter.isConfigurato()) {
    throw new BankProviderError(
      ERR_CONFIG,
      'Provider Open Banking non configurato',
      { statusCode: 503 },
    );
  }
  return adapter.listIstituti(paese);
}

/**
 * Avvia un'autorizzazione bancaria.
 *
 * @param {Object} dati
 * @param {number} dati.userId
 * @param {string} dati.institutionId
 * @param {boolean} [dati.sostituisci] se true revoca la connessione viva
 *   prima di crearne una nuova (azione "Sostituisci conto"). Senza questo
 *   flag una connessione già presente fa fallire la richiesta: sostituire
 *   una banca non deve poter succedere per sbaglio.
 * @param {import('./providers/BankProvider').BankProvider} [dati.provider]
 */
async function avviaConnessione({
  userId, institutionId, sostituisci = false, provider = null,
}) {
  const adapter = provider ?? await getBankProvider();
  if (!await adapter.isConfigurato()) {
    throw new BankProviderError(
      ERR_CONFIG, 'Provider Open Banking non configurato', { statusCode: 503 },
    );
  }

  // Lo `state` esiste solo in questa variabile e nell'URL che l'utente
  // segue: nel database va soltanto il suo hash.
  const state = crypto.randomBytes(32).toString('base64url');
  const redirectUrl = redirectCallback(state);

  let connessionePrecedente = null;

  /**
   * Il limite è nel database (indice parziale), e il database è l'ultima
   * parola: due richieste simultanee passano ENTRAMBE il controllo
   * applicativo qui sotto, perché un `SELECT ... FOR UPDATE` che non trova
   * righe non blocca niente. La seconda si schianta sull'indice, e deve
   * ricevere lo stesso 409 della prima invece di un 500: per chi chiama è
   * la stessa situazione, "hai già un conto collegato".
   */
  const erroreLimite = () => Object.assign(
    new Error('Hai già un conto bancario collegato. Puoi sostituirlo o scollegarlo.'),
    { statusCode: 409, codice: 'limite_connessioni_raggiunto' },
  );

  const connessione = await sequelize.transaction(async (transaction) => {
    await liberaTentativiScaduti(userId, { transaction });

    const viva = await trovaConnessioneViva(userId, { transaction, lock: true });
    if (viva && !sostituisci) throw erroreLimite();

    if (viva) {
      // Sostituzione: la vecchia connessione diventa terminale e libera il
      // posto. I suoi movimenti restano, e continuano a puntare a lei.
      connessionePrecedente = viva;
      await viva.update({
        status: STATO_REVOCATA,
        state_hash: null,
        sync_started_at: null,
      }, { transaction });
    }

    try {
      return await BankConnection.create({
        user_id: userId,
        provider: adapter.nome,
        institution_id: String(institutionId).slice(0, 120),
        status: STATO_IN_ATTESA,
        state_hash: hashState(state),
        state_expires_at: scadenzaState(),
      }, { transaction });
    } catch (error) {
      if (error?.name === 'SequelizeUniqueConstraintError') throw erroreLimite();
      throw error;
    }
  });

  // La chiamata al provider sta FUORI dalla transazione: una richiesta HTTP
  // lenta non deve tenere aperta una transazione sul database, e il posto è
  // già stato riservato dalla riga `in_attesa`.
  let autorizzazione;
  try {
    autorizzazione = await adapter.createAuthorization({
      institutionId,
      redirectUrl,
      // Identificatore opaco: NON contiene l'id utente. Ciò che transita nel
      // browser e nei sistemi del provider non deve permettere di dedurre o
      // manipolare a quale utente verrà collegato il conto.
      reference: state,
    });
  } catch (error) {
    // Il tentativo non è andato a buon fine: libera subito il posto, invece
    // di lasciare l'utente bloccato per i 30 minuti di validità dello state.
    await connessione.update({ status: STATO_REVOCATA, state_hash: null }).catch(() => {});
    throw error;
  }

  await connessione.update({
    provider_connection_id: autorizzazione.providerConnectionId,
    consent_created_at: autorizzazione.consentCreatedAt ?? new Date(),
    consent_expires_at: autorizzazione.consentExpiresAt ?? null,
  });

  if (connessionePrecedente) {
    await registraAudit({
      userId,
      evento: EVENTI.CONNESSIONE_SOSTITUITA,
      entita: 'bank_connection',
      entitaId: connessionePrecedente.id,
      metadata: { istituto_precedente: connessionePrecedente.institution_id, nuova_connessione: connessione.id },
    });
    // La revoca presso il provider è "best effort": se fallisce, lo stato
    // locale è già terminale e l'utente non resta bloccato.
    adapter.revokeConnection({
      providerConnectionId: connessionePrecedente.provider_connection_id,
    }).catch(() => {});
  }

  await registraAudit({
    userId,
    evento: EVENTI.CONNESSIONE_AVVIATA,
    entita: 'bank_connection',
    entitaId: connessione.id,
    metadata: { provider: adapter.nome, institution_id: institutionId, sostituzione: !!connessionePrecedente },
  });

  return {
    connection_id: connessione.id,
    url_autorizzazione: autorizzazione.urlAutorizzazione,
    scade_il: connessione.state_expires_at,
  };
}

/**
 * Completa l'autorizzazione dopo il ritorno dell'utente dalla banca.
 *
 * ── Le cinque verifiche sullo `state`, tutte necessarie ──────────────────
 *  1. esiste una connessione con quell'hash;
 *  2. appartiene all'utente autenticato (mai dedotto dalla richiesta);
 *  3. non è scaduto;
 *  4. non è già stato usato;
 *  5. la connessione è ancora nello stato `in_attesa`.
 *
 * Il punto 4 dà anche l'idempotenza richiesta: un callback consegnato due
 * volte (doppio click, refresh della pagina) trova lo stato già consumato e
 * restituisce la connessione esistente invece di crearne una seconda.
 *
 * Il consumo dello stato è un UPDATE CONDIZIONALE, non una lettura seguita da
 * una scrittura: due richieste simultanee non possono entrambe trovarlo
 * libero, perché solo una vede `rowCount = 1`.
 */
async function completaConnessione({
  userId, state, code = null, provider = null,
}) {
  if (typeof state !== 'string' || state.length < 20) {
    throw Object.assign(new Error('Autorizzazione non valida o scaduta'), { statusCode: 400 });
  }

  const hash = hashState(state);
  const connessione = await BankConnection.findOne({ where: { state_hash: hash } });

  // Messaggio identico in tutti i casi di rifiuto: non diciamo a chi presenta
  // uno state se quello state esista, a chi appartenga o sia soltanto
  // scaduto.
  const rifiuta = async (motivo) => {
    await registraAudit({
      userId,
      evento: EVENTI.CALLBACK_RIFIUTATO,
      entita: 'bank_connection',
      entitaId: connessione?.id ?? null,
      esito: ESITI.RIFIUTATO,
      metadata: { motivo },
    });
    throw Object.assign(new Error('Autorizzazione non valida o scaduta'), { statusCode: 400 });
  };

  if (!connessione) return rifiuta('state_inesistente');
  if (connessione.user_id !== userId) return rifiuta('state_di_altro_utente');
  if (connessione.state_used_at) {
    // Già completato: se la connessione è viva, è un doppio invio e va
    // trattato come successo (idempotenza). Altrimenti è un riuso.
    // `da_riconciliare` conta come "viva" qui esattamente come `attiva`: un
    // utente che ricarica la pagina di ritorno dalla banca prima ancora di
    // aver scelto il conto deve ritrovare la propria connessione, non un
    // errore di state riusato.
    if ([STATO_DA_RICONCILIARE, STATO_ATTIVA].includes(connessione.status)) {
      const conto = connessione.conto_id
        ? await Conto.findOne({ where: { id: connessione.conto_id, user_id: userId } })
        : null;
      return { connessione: serializza(connessione, { conto }), ripetuto: true };
    }
    return rifiuta('state_gia_usato');
  }
  if (!connessione.state_expires_at || connessione.state_expires_at < new Date()) {
    return rifiuta('state_scaduto');
  }
  if (connessione.status !== STATO_IN_ATTESA) return rifiuta('stato_non_in_attesa');

  // Consumo atomico: solo una richiesta può portare a 1 questo UPDATE.
  const [consumate] = await BankConnection.update(
    { state_used_at: new Date() },
    {
      where: {
        id: connessione.id,
        user_id: userId,
        state_used_at: null,
        status: STATO_IN_ATTESA,
      },
    },
  );
  if (consumate !== 1) return rifiuta('state_consumato_in_concorrenza');

  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });

  let esito;
  try {
    esito = await adapter.handleCallback({
      providerConnectionId: connessione.provider_connection_id,
      // Serve ai provider che al ritorno consegnano un codice da scambiare
      // con una sessione (Enable Banking). GoCardless lo ignora: la
      // requisition è già identificata. Non autorizza niente di per sé —
      // l'utente è già stato riconosciuto dalle verifiche sullo `state`.
      code,
    });
  } catch (error) {
    await connessione.update({
      status: STATO_ERRORE,
      error_code: error.codice ?? null,
      last_error_at: new Date(),
      state_hash: null,
    });
    await registraAudit({
      userId,
      evento: EVENTI.CALLBACK_RIFIUTATO,
      entita: 'bank_connection',
      entitaId: connessione.id,
      esito: ESITI.ERRORE,
      metadata: { motivo: 'provider_ha_rifiutato', codice: error.codice ?? null },
    });
    throw error;
  }

  if (!esito.conti?.length) {
    await connessione.update({
      status: STATO_ERRORE, state_hash: null, last_error_at: new Date(),
    });
    throw Object.assign(new Error('La banca non ha restituito nessun conto'), { statusCode: 409 });
  }

  // La scadenza del consenso non arriva con `handleCallback` (nessun
  // provider la restituisce qui: GoCardless e Sandbox la stimano già in
  // `avviaConnessione`, Enable Banking non la ridichiara alla sessione), ma
  // se un giorno arrivasse va preferita a quella stimata. Senza, si
  // preserva semplicemente il valore già scritto.
  const scadenzaConsenso = esito.consentExpiresAt ?? connessione.consent_expires_at;

  // Il conto NON viene scelto qui. Al callback sappiamo che l'autorizzazione
  // esiste, non a quale conto WALLT appartengono questi movimenti: l'utente
  // può già tracciare quella banca a mano, e creargliene un altro accanto
  // significa contare due volte lo stesso denaro. La scelta avviene in
  // `completaRiconciliazione`, quando i conti veri della banca sono noti.
  //
  // Per lo stesso motivo non si scrivono `provider_account_id`,
  // `iban_mascherato`, `valuta` e `saldo_provider`: descrivono un conto
  // ancora da scegliere, e riempirli col primo della lista era il difetto.
  //
  // `provider_connection_id` e `institution_name` invece NON descrivono il
  // conto: il primo descrive l'autorizzazione, il secondo la banca, ed
  // entrambi sono già noti a prescindere da quale conto l'utente scelga.
  const attivata = await connessione.update({
    status: STATO_DA_RICONCILIARE,
    consent_created_at: new Date(),
    consent_expires_at: scadenzaConsenso,
    state_used_at: new Date(),
    // Alcuni provider cambiano identificatore quando l'autorizzazione
    // diventa una connessione viva: Enable Banking consegna un
    // `session_id` che sostituisce l'`authorization_id` salvato al
    // collegamento, ed è quello che poi si interroga e si revoca.
    // Chi non lo fa (GoCardless) non restituisce il campo e la riga resta
    // com'era.
    ...(esito.providerConnectionId
      ? { provider_connection_id: esito.providerConnectionId }
      : {}),
    institution_name: esito.conti[0].istituto?.nome ?? connessione.institution_name,
  });

  await registraAudit({
    userId,
    evento: EVENTI.CONNESSIONE_CREATA,
    entita: 'bank_connection',
    entitaId: connessione.id,
    metadata: { provider: adapter.nome, institution_id: connessione.institution_id },
  });

  return { connessione: serializza(attivata), ripetuto: false };
}

/**
 * Scollega la banca.
 *
 * NON cancella movimenti. La connessione diventa `revocata`, il consenso
 * viene revocato presso il provider, e il conto WALLT resta con il suo saldo
 * e la sua storia: diventa un normale conto manuale. Cancellare i dati
 * importati è una seconda azione, separata e dietro riverifica d'identità.
 */
async function scollega({ userId, provider = null }) {
  const connessione = await trovaConnessioneViva(userId);
  if (!connessione) {
    throw Object.assign(new Error('Nessun conto bancario collegato'), { statusCode: 404 });
  }

  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });
  const esitoRevoca = await adapter.revokeConnection({
    providerConnectionId: connessione.provider_connection_id,
  });

  await connessione.update({
    status: STATO_REVOCATA,
    state_hash: null,
    sync_started_at: null,
  });

  await registraAudit({
    userId,
    evento: EVENTI.CONNESSIONE_REVOCATA,
    entita: 'bank_connection',
    entitaId: connessione.id,
    metadata: {
      institution_id: connessione.institution_id,
      revoca_provider_confermata: !!esitoRevoca?.revocata,
    },
  });

  return {
    scollegata: true,
    revoca_provider_confermata: !!esitoRevoca?.revocata,
    // Dichiarato per contratto: chi legge la risposta deve poter dire
    // all'utente che i suoi dati sono ancora lì.
    movimenti_conservati: true,
  };
}

/**
 * Cancella i movimenti importati dalla banca. Azione distruttiva, separata
 * dallo scollegamento e dietro riverifica d'identità (`requireStepUp`).
 *
 * Riguarda solo le righe con `origine = 'open_banking'`: un movimento che
 * l'utente ha inserito a mano sul conto bancario non è un dato importato e
 * non viene toccato.
 *
 * Il saldo del conto viene ricalcolato dai movimenti rimasti. Per un conto
 * sincronizzato il saldo arriva normalmente dalla banca, non dalla somma dei
 * movimenti: dopo questa cancellazione quella fonte non c'è più, e la somma
 * delle righe restanti è l'unico valore che il database può ancora
 * giustificare.
 */
async function eliminaDatiImportati({ userId }) {
  return sequelize.transaction(async (transaction) => {
    const connessioni = await BankConnection.findAll({
      where: { user_id: userId },
      transaction,
    });
    const contiCoinvolti = [...new Set(connessioni.map((c) => c.conto_id).filter(Boolean))];

    const eliminati = await Movimento.destroy({
      where: {
        user_id: userId,
        origine: ORIGINE_OPEN_BANKING,
      },
      transaction,
    });

    for (const contoId of contiCoinvolti) {
      const conto = await Conto.findOne({
        where: { id: contoId, user_id: userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!conto) continue;

      const rimasti = await Movimento.findAll({
        where: { user_id: userId, conto_id: contoId, tipo: { [Op.in]: ['entrata', 'uscita'] } },
        attributes: ['tipo', 'importo'],
        transaction,
      });
      const saldo = rimasti.reduce((somma, m) => {
        const importo = Number(m.importo) || 0;
        return somma + (m.tipo === 'entrata' ? importo : -importo);
      }, 0);

      await aggiornaSaldoConto(conto, Math.round(saldo * 100) / 100, transaction);
    }

    await BankConnection.update(
      { movimenti_importati_totali: 0, duplicati_evitati_totali: 0 },
      { where: { user_id: userId }, transaction },
    );

    logger.info('Dati importati da Open Banking eliminati su richiesta', {
      user_id: userId, conti_ricalcolati: contiCoinvolti.length,
    });

    return { movimenti_eliminati: eliminati, conti_ricalcolati: contiCoinvolti.length };
  });
}

/**
 * Sospende le connessioni di un utente perché il suo entitlement è stato
 * revocato.
 *
 * Nessuna nuova sincronizzazione, nessun dato perso: lo stato
 * `sospesa_entitlement` occupa ancora il posto (non gli si offre di
 * collegarne un'altra) ma non è sincronizzabile. È la seconda barriera
 * rispetto a `requireFeature`, che già blocca ogni rotta: due controlli
 * indipendenti sulla stessa regola.
 */
async function sospendiPerEntitlement({ userId, actorUserId = null }) {
  const [quante] = await BankConnection.update(
    { status: STATO_SOSPESA_ENTITLEMENT, sync_started_at: null },
    {
      where: {
        user_id: userId,
        status: { [Op.in]: [STATO_ATTIVA, STATO_ERRORE, STATO_CONSENSO_SCADUTO] },
      },
    },
  );

  if (quante > 0) {
    await registraAudit({
      userId,
      actorUserId,
      evento: EVENTI.CONNESSIONE_SOSPESA,
      entita: 'bank_connection',
      metadata: { connessioni_sospese: quante, motivo: 'entitlement_revocato' },
    });
  }
  return { sospese: quante };
}

/** Riattiva una connessione sospesa quando l'entitlement torna. Lo stato
 * torna `attiva`: il consenso presso la banca non è stato toccato, e la
 * prima sincronizzazione dirà se è ancora valido. */
async function riattivaDopoEntitlement({ userId }) {
  const [quante] = await BankConnection.update(
    { status: STATO_ATTIVA },
    { where: { user_id: userId, status: STATO_SOSPESA_ENTITLEMENT } },
  );
  return { riattivate: quante };
}

module.exports = {
  hashState,
  redirectCallback,
  serializza,
  trovaConnessioneViva,
  liberaTentativiScaduti,
  statoConnessione,
  datiRiconciliazione,
  completaRiconciliazione,
  istitutiDisponibili,
  avviaConnessione,
  completaConnessione,
  scollega,
  eliminaDatiImportati,
  sospendiPerEntitlement,
  riattivaDopoEntitlement,
};
