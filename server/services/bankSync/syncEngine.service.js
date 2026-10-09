const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, BankConnection, Conto, Movimento,
} = require('../../models');
const logger = require('../../utils/logger');
const {
  STATO_ATTIVA, STATO_CONSENSO_SCADUTO, STATO_ERRORE, STATI_SINCRONIZZABILI,
  SYNC_LOCK_SCADENZA_MINUTI, GIORNI_STORICO_INIZIALE, GIORNI_STORICO_INCREMENTALE,
  ERR_SYNC_IN_CORSO, ERR_COOLDOWN, ERR_SYNC_FAILED, ERR_NO_TRANSACTIONS,
  ERR_CONSENT_EXPIRED, ERR_AUTHORIZATION_REVOKED, ERR_SOGLIA_RICHIESTA,
  ERR_LIMITE_MANUALI, ORIGINE_OPEN_BANKING, TX_BOOKED,
} = require('../../constants/bankSync');
const {
  BANK_SYNC_COOLDOWN_SECONDI, BANK_SYNC_MANUALI_AL_GIORNO,
} = require('../../constants/appConfig');
const { oggiLocale, FUSO_DEFAULT } = require('../../utils/dateRome');
const { getConfig } = require('../appConfig.service');
const { getBankProvider } = require('./providers');
const { BankProviderError } = require('./providers/BankProvider');
const { normalizzaTransazioni } = require('./normalizer');
const DuplicateChecker = require('../import/DuplicateChecker');
const CategoryMatcherService = require('../import/CategoryMatcherService');
const { assertCategory, loadHiddenDefaults } = require('../categorie.service');
const { aggiornaSaldoConto } = require('../scommesseContoSync.service');
const { valutaBudgetDopoMovimento } = require('../notifiche/NotificheGenerator');
const { registraAudit, EVENTI, ESITI } = require('../auditLog.service');

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Il motore di sincronizzazione
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   provider → normalizzazione → deduplica → categorizzazione → MOVIMENTI
 *                                                                   ↓
 *                                              Dashboard · Analisi · Piano Smart
 *
 * ── I movimenti bancari sono movimenti WALLT, non un mondo separato ──────
 * Non esiste una tabella `bank_transactions`. Le transazioni della banca
 * diventano righe normali in `movimenti`, con `tipo` entrata/uscita, importo
 * positivo e `ricorrente: false`: quindi `muoveSaldo` è vero per loro
 * (Regola 11), e patrimonio, liquidità, saldo effettivo, budget, analisi e
 * Piano Smart le vedono senza che nessuno di quei file sia stato toccato.
 * Era il requisito: il dato definitivo entra nel flusso finanziario standard.
 *
 * ── Non c'è una seconda pipeline ─────────────────────────────────────────
 * Deduplica (`DuplicateChecker`), categorizzazione
 * (`CategoryMatcherService`) e validazione della categoria (`assertCategory`)
 * sono le STESSE usate dall'import da file. Riscriverle qui avrebbe prodotto
 * due cascate divergenti sullo stesso problema (Coding Rule 6), e la
 * categoria eliminata dall'utente sarebbe potuta riapparire da questa strada
 * (Regola 18).
 *
 * ── Idempotenza, su tre livelli ──────────────────────────────────────────
 * 1. L'indice UNIQUE parziale `(bank_connection_id, external_transaction_id)`:
 *    è il database a rifiutare un doppione, non la logica applicativa.
 * 2. La pre-interrogazione degli id già presenti: evita di tentare l'inserto
 *    e di far abortire la transazione.
 * 3. Per le transazioni che il provider consegna senza id stabile,
 *    `DuplicateChecker` (data + importo + descrizione + conto, con
 *    similarità del testo). Mai "data + importo" da solo: due caffè da 1,20 €
 *    lo stesso giorno sono due spese reali.
 *
 * Una transazione CON id stabile non passa da `DuplicateChecker`: l'id dice
 * già che è un'operazione distinta, e il confronto per somiglianza
 * scarterebbe per sbaglio due acquisti identici legittimi.
 *
 * ── Una sola sincronizzazione per connessione alla volta ─────────────────
 * `sync_started_at` è un lock preso con un UPDATE CONDIZIONALE: chi vede
 * `rowCount = 0` sa che un'altra sincronizzazione è in corso e si ferma. Il
 * lock scade da sé dopo `SYNC_LOCK_SCADENZA_MINUTI`, così un processo morto
 * (una funzione serverless interrotta) non blocca la connessione per sempre.
 * È ciò che impedisce al cron e al pulsante "Sincronizza" di lavorare
 * insieme sulla stessa connessione.
 *
 * ── Un errore non distrugge i dati precedenti ────────────────────────────
 * Se il provider fallisce, la transazione sul database non è ancora iniziata
 * (o viene rollbackata): nessun movimento viene toccato, il saldo resta
 * quello di prima, e sulla connessione vengono scritti solo `error_code` e
 * `last_error_at`. `last_successful_sync_at` NON viene aggiornato: è il dato
 * che permette all'interfaccia di dire "ultimo aggiornamento riuscito ieri
 * alle 22:10" invece di svuotare la pagina.
 */

const oggiISO = () => new Date().toISOString().slice(0, 10);

const giorniPrimaISO = (giorni) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - giorni);
  return d.toISOString().slice(0, 10);
};

const giornoDopoISO = (dataISO) => {
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * La più recente fra due date ISO, ignorando quelle assenti.
 *
 * Con `import_da` nullo il risultato è la finestra di sempre: è ciò che fa
 * comportare le connessioni esistenti esattamente come prima che la soglia
 * esistesse.
 */
const maxDataISO = (a, b) => {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
};

/**
 * Da quando conviene iniziare a importare: il giorno successivo all'ultimo
 * movimento NON futuro dell'utente, come `YYYY-MM-DD`, oppure `null` se non
 * ha movimenti (nessuna soglia da suggerire, nessun rischio).
 *
 * Il vincolo sul futuro non è decorativo: un movimento già registrato in
 * avanti — una spesa programmata, un promemoria — produrrebbe un
 * suggerimento oltre oggi, cioè «non importare niente».
 *
 * «Oggi» è il giorno civile nel fuso dell'utente (Regola 16), non quello del
 * processo: su Vercel il processo gira in UTC, e fra le 22:00/23:00 UTC e la
 * mezzanotte di Roma il giorno civile italiano è già quello successivo. Con
 * l'UTC un movimento inserito «oggi» secondo Roma risulterebbe futuro,
 * verrebbe escluso, e il suggerimento arretrerebbe di un giorno — proponendo
 * di importare un giorno che l'utente ha già registrato a mano, cioè
 * esattamente ciò che questa funzione esiste per evitare.
 *
 * `riferimento` è iniettabile come in `speseMedie.service.js` e
 * `financialContext.service.js`: serve a poter verificare il confine senza
 * congelare l'orologio. In produzione resta l'istante corrente.
 *
 * Guarda prima il conto di destinazione; se quel conto è vuoto (il caso di
 * chi ha creato un conto nuovo pur avendo storico altrove) ripiega su tutti
 * i conti dell'utente, perché il rischio di doppio conteggio è cross-conto.
 */
async function dataSuggeritaImport({ userId, contoId = null, riferimento = new Date() }) {
  const oggi = oggiLocale(FUSO_DEFAULT, riferimento);

  const ultimaData = async (filtro) => {
    const riga = await Movimento.findOne({
      where: { user_id: userId, data: { [Op.lte]: oggi }, ...filtro },
      attributes: ['data'],
      order: [['data', 'DESC']],
    });
    return riga?.data ?? null;
  };

  let ultima = contoId ? await ultimaData({ conto_id: contoId }) : null;
  if (!ultima) ultima = await ultimaData({});
  return ultima ? giornoDopoISO(ultima) : null;
}

/**
 * L'UNICO punto in cui WALLT si chiede: «questa sincronizzazione
 * importerebbe sopra uno storico che l'utente ha già?».
 *
 * Restituisce i dettagli della domanda quando è il caso di porla, `null`
 * altrimenti. Gli esiti sono due — 409 per una persona, salto per il cron —
 * ma la domanda resta una sola: due punti che la calcolano sarebbero due
 * risposte possibili alla stessa cosa, ed è anche la ragione per cui
 * `GET /bank-sync/riconciliazione` non la espone.
 *
 * La deduplica non può sostituirla: il livello 2 filtra per
 * `bank_connection_id`, che sui movimenti manuali è nullo, e il livello 3
 * (`DuplicateChecker`) si applica solo alle transazioni senza id stabile.
 */
async function sogliaMancante({ userId, connessione }) {
  // Non è la prima volta, oppure la soglia c'è già: niente da chiedere.
  if (connessione.last_successful_sync_at || connessione.import_da) return null;

  // I movimenti che NON vengono da questa connessione: inseriti a mano,
  // importati da file, o portati da un collegamento precedente.
  const preesistenti = await Movimento.count({
    where: {
      user_id: userId,
      [Op.or]: [
        { bank_connection_id: null },
        { bank_connection_id: { [Op.ne]: connessione.id } },
      ],
    },
  });
  if (preesistenti === 0) return null;

  return {
    data_suggerita: await dataSuggeritaImport({ userId, contoId: connessione.conto_id }),
    movimenti_preesistenti: preesistenti,
  };
}

/** Errore di sincronizzazione con codice, per il client e per l'audit. */
class SyncError extends Error {
  constructor(codice, messaggio, { statusCode = 409, dettagli = null } = {}) {
    super(messaggio);
    this.name = 'SyncError';
    this.codice = codice;
    this.statusCode = statusCode;
    this.dettagli = dettagli;
  }
}

/**
 * Prende il lock di sincronizzazione.
 *
 * UPDATE condizionale e non "leggi, controlla, scrivi": due richieste
 * simultanee non possono entrambe vedere il lock libero, perché solo una
 * ottiene `rowCount = 1`.
 */
async function acquisisciLock(connectionId, userId) {
  const [, metadata] = await sequelize.query(
    `UPDATE bank_connections
        SET sync_started_at = now(), updated_at = now()
      WHERE id = :id
        AND user_id = :userId
        AND (sync_started_at IS NULL
             OR sync_started_at < now() - (:minuti || ' minutes')::interval)`,
    {
      replacements: { id: connectionId, userId, minuti: SYNC_LOCK_SCADENZA_MINUTI },
      type: QueryTypes.UPDATE,
    },
  );
  // Postgres + Sequelize: il numero di righe toccate arriva nel metadata.
  const righe = typeof metadata === 'number' ? metadata : (metadata?.rowCount ?? 0);
  return righe === 1;
}

/**
 * Consuma uno dei gettoni giornalieri per le sincronizzazioni manuali.
 *
 * Un solo UPDATE condizionale, per la stessa ragione del lock qui sopra:
 * "conta e poi scrivi" non è atomico, e due richieste simultanee leggerebbero
 * entrambe lo stesso contatore (Coding Rule 22). Il CASE azzera il contatore
 * quando il giorno civile registrato non è più quello corrente, così il
 * limite si resetta a mezzanotte da sé, senza nessun cron che lo ripulisca.
 *
 * `oggi` è un giorno civile nel fuso applicativo, calcolato da chi chiama:
 * su Vercel il processo gira in UTC, e `CURRENT_DATE` farebbe scattare il
 * reset all'ora sbagliata per metà dell'anno (Regola 16).
 *
 * @returns {Promise<number|null>} i gettoni usati dopo il consumo, oppure
 *   `null` se erano già esauriti (nessuna riga aggiornata).
 */
async function consumaGettoneManuale(connectionId, userId, oggi, limite) {
  const [righe] = await sequelize.query(
    `UPDATE bank_connections
        SET sync_manuali_giorno = CASE
              WHEN sync_manuali_giorno_data = :oggi THEN sync_manuali_giorno + 1
              ELSE 1
            END,
            sync_manuali_giorno_data = :oggi,
            updated_at = now()
      WHERE id = :id
        AND user_id = :userId
        AND (sync_manuali_giorno_data IS DISTINCT FROM :oggi
             OR sync_manuali_giorno < :limite)
      RETURNING sync_manuali_giorno`,
    {
      replacements: {
        id: connectionId, userId, oggi, limite,
      },
      type: QueryTypes.UPDATE,
    },
  );
  // Con RETURNING, Postgres + Sequelize mettono le righe aggiornate nel primo
  // elemento: un array vuoto significa che la WHERE non ha trovato nulla da
  // aggiornare, cioè che i gettoni di oggi sono finiti.
  const aggiornata = Array.isArray(righe) ? righe[0] : null;
  return aggiornata ? Number(aggiornata.sync_manuali_giorno) : null;
}

const rilasciaLock = (connectionId) => BankConnection.update(
  { sync_started_at: null },
  { where: { id: connectionId } },
).catch((error) => {
  // Se il rilascio fallisce il lock scade da sé: va segnalato, non propagato
  // sopra un esito di sincronizzazione già deciso.
  logger.warn('Rilascio lock sincronizzazione fallito', { err: error });
});

/** Lo stato in cui mettere la connessione dopo un errore. */
const statoDopoErrore = (codice) => {
  if (codice === ERR_CONSENT_EXPIRED || codice === ERR_AUTHORIZATION_REVOKED) {
    return STATO_CONSENSO_SCADUTO;
  }
  return STATO_ERRORE;
};

/**
 * Sincronizza una connessione bancaria.
 *
 * @param {Object} dati
 * @param {number} dati.userId
 * @param {number} [dati.connectionId]  se assente usa la connessione viva
 * @param {'manuale'|'cron'} [dati.origine]
 * @param {import('./providers/BankProvider').BankProvider} [dati.provider]
 * @param {boolean} [dati.ignoraCooldown] solo per il cron, che ha un proprio
 *   criterio di selezione (ore minime dall'ultima sync riuscita)
 * @param {string|null} [dati.importDa] la soglia `YYYY-MM-DD` scelta
 *   dall'utente: viene persistita sulla connessione e vale anche per le
 *   sincronizzazioni successive
 */
async function sincronizza({
  userId,
  connectionId = null,
  origine = 'manuale',
  provider = null,
  ignoraCooldown = false,
  importDa = null,
  dataDa: dataDaScelta = null,
  dataA: dataAScelta = null,
}) {
  const connessione = await BankConnection.findOne({
    where: {
      user_id: userId,
      ...(connectionId ? { id: connectionId } : { status: { [Op.in]: STATI_SINCRONIZZABILI } }),
    },
  });

  if (!connessione) {
    throw new SyncError(ERR_SYNC_FAILED, 'Nessun conto bancario da sincronizzare', { statusCode: 404 });
  }
  // L'appartenenza è già nella where: una connessione di un altro utente non
  // viene trovata, e il messaggio è lo stesso di una inesistente.
  if (!STATI_SINCRONIZZABILI.includes(connessione.status)) {
    throw new SyncError(
      connessione.status === STATO_CONSENSO_SCADUTO ? ERR_CONSENT_EXPIRED : ERR_SYNC_FAILED,
      connessione.status === STATO_CONSENSO_SCADUTO
        ? 'Il collegamento con la banca è scaduto: ricollega il conto.'
        : 'Questo conto non è sincronizzabile in questo momento.',
    );
  }

  if (!connessione.conto_id || !connessione.provider_account_id) {
    throw new SyncError(ERR_SYNC_FAILED, 'Connessione incompleta: ricollega il conto.');
  }

  // ─── La soglia: da quando importare ─────────────────────────────────────
  //
  // La scelta dell'utente va persistita PRIMA della guardia — è la risposta
  // alla domanda che la guardia pone — e resta sulla connessione, così vale
  // anche per le sincronizzazioni successive.
  if (importDa && importDa !== connessione.import_da) {
    await connessione.update({ import_da: importDa });
  }

  // La guardia sta prima del cooldown e del lock: una richiesta che va
  // fermata non deve consumare né l'uno né l'altro.
  const soglia = await sogliaMancante({ userId, connessione });
  if (soglia) {
    if (origine === 'cron') {
      // Non c'è nessuno a cui chiedere la data. Marcare errore a ogni
      // passaggio riempirebbe la connessione di un guasto che non esiste:
      // l'utente vedrebbe «da sistemare» su una funzione che sta soltanto
      // aspettando una sua scelta. Quindi si salta, senza toccare niente —
      // né `error_code`, né `last_error_at`, né i contatori.
      logger.info('Sincronizzazione pianificata saltata: soglia non impostata', {
        connessione_id: connessione.id,
      });
      return { saltato: true, motivo: 'soglia_non_impostata', importati: 0 };
    }
    throw new SyncError(
      ERR_SOGLIA_RICHIESTA,
      'Hai già dei movimenti registrati. Scegli da quando importare per non '
      + 'ritrovarti la stessa spesa due volte.',
      { statusCode: 409, dettagli: soglia },
    );
  }

  // Cooldown: protegge la quota API del provider da un utente che tiene
  // premuto "Sincronizza". Non si applica al cron, che ha un criterio
  // proprio e più largo.
  if (!ignoraCooldown) {
    const cooldownSecondi = await getConfig(BANK_SYNC_COOLDOWN_SECONDI);
    const ultimo = connessione.last_sync_at ? new Date(connessione.last_sync_at).getTime() : 0;
    const attesa = ultimo + cooldownSecondi * 1000 - Date.now();
    if (attesa > 0) {
      throw new SyncError(
        ERR_COOLDOWN,
        'Hai sincronizzato di recente. Riprova fra poco.',
        { statusCode: 429, dettagli: { riprova_fra_secondi: Math.ceil(attesa / 1000) } },
      );
    }
  }

  // ─── Il tetto giornaliero delle sincronizzazioni manuali ───────────────
  //
  // Sta DOPO i controlli che fermano una richiesta per un altro motivo
  // (soglia, cooldown) e PRIMA del lock: un gettone si consuma solo se la
  // sincronizzazione sta davvero partendo, ma consumarlo prima del lock
  // significa che un doppio clic simultaneo può spenderne due, di cui uno
  // sprecato. È il compromesso scelto: metterlo dopo il lock lascerebbe il
  // lock appeso fino alla sua scadenza — il `finally` che lo rilascia apre
  // più in basso — e l'utente leggerebbe "sincronizzazione già in corso" per
  // minuti al posto del vero motivo.
  //
  // Il passaggio automatico notturno non consuma nulla: è il cron a dover
  // garantire l'aggiornamento quotidiano, e sottrarlo dai due gettoni
  // dell'utente significherebbe dargliene uno solo.
  if (origine === 'manuale') {
    const limite = await getConfig(BANK_SYNC_MANUALI_AL_GIORNO);
    const oggi = oggiLocale(FUSO_DEFAULT);
    const usati = await consumaGettoneManuale(connessione.id, userId, oggi, limite);
    if (usati === null) {
      throw new SyncError(
        ERR_LIMITE_MANUALI,
        `Hai già sincronizzato ${limite} volte oggi. Il prossimo aggiornamento `
        + 'automatico è stanotte, e domani i tentativi manuali tornano disponibili.',
        { statusCode: 429, dettagli: { limite, usati: limite, giorno: oggi } },
      );
    }
  }

  if (!await acquisisciLock(connessione.id, userId)) {
    throw new SyncError(
      ERR_SYNC_IN_CORSO,
      'Una sincronizzazione è già in corso per questo conto.',
      { statusCode: 409 },
    );
  }

  const adapter = provider ?? await getBankProvider({ nome: connessione.provider });
  const primaVolta = !connessione.last_successful_sync_at;
  const giorni = primaVolta ? GIORNI_STORICO_INIZIALE : GIORNI_STORICO_INCREMENTALE;
  // `import_da` è un PAVIMENTO sulla FINESTRA PREDEFINITA (quella del cron e
  // del normale "Sincronizza"), non su un intervallo scelto esplicitamente
  // dall'utente: la presenza di `dataDaScelta` lo supera.
  //
  // Il server non sa nulla di ciò che l'utente ha visto prima di chiamare —
  // qui si distingue soltanto un intervallo *richiesto* da una finestra
  // *predefinita*. È quella distinzione a servire: senza di essa, confermare
  // la soglia proposta sarebbe l'unico modo per fissarla, e chi l'accetta
  // rinuncerebbe per sempre ai 90 giorni di storico bancario anteriore —
  // non esiste nessun'altra rotta per modificare `import_da`.
  const dataDa = dataDaScelta || maxDataISO(giorniPrimaISO(giorni), connessione.import_da);
  const dataA = dataAScelta || oggiISO();

  await registraAudit({
    userId,
    evento: EVENTI.SYNC_AVVIATA,
    entita: 'bank_connection',
    entitaId: connessione.id,
    metadata: {
      origine,
      giorni_richiesti: Math.floor((Date.parse(`${dataA}T00:00:00.000Z`)
        - Date.parse(`${dataDa}T00:00:00.000Z`)) / 86400000) + 1,
      prima_sincronizzazione: primaVolta,
      data_da: dataDa,
      data_a: dataA,
    },
  });

  try {
    // ─── 1. Provider ────────────────────────────────────────────────────
    // Sincronizzazione incrementale: solo la finestra necessaria, non tutta
    // la cronologia a ogni passaggio. La sovrapposizione con l'ultima sync è
    // voluta — una transazione può essere contabilizzata con giorni di
    // ritardo — e la deduplica la rende gratuita.
    const risposta = await adapter.getTransactions({
      providerAccountId: connessione.provider_account_id,
      dataDa,
      dataA,
    });

    let saldoBanca = null;
    if (typeof adapter.getBalance === 'function') {
      try {
        // La lettura è separata: Enable Banking non include il saldo nella
        // risposta dei movimenti. Un problema sul saldo non deve impedire
        // l'importazione delle transazioni appena ricevute.
        saldoBanca = await adapter.getBalance({
          providerAccountId: connessione.provider_account_id,
        });
      } catch (error) {
        logger.warn('Saldo non disponibile dal provider bancario', {
          provider: connessione.provider,
          codice: error.codice ?? null,
        });
      }
    }

    const rispostaConSaldo = {
      ...risposta,
      saldo: saldoBanca ?? risposta.saldo ?? null,
    };
    const esito = await importaTransazioni({ userId, connessione, risposta: rispostaConSaldo });

    await connessione.update({
      status: STATO_ATTIVA,
      last_sync_at: new Date(),
      last_successful_sync_at: new Date(),
      last_error_at: null,
      error_code: null,
      sync_ok_totali: connessione.sync_ok_totali + 1,
      movimenti_importati_totali: connessione.movimenti_importati_totali + esito.importati,
      duplicati_evitati_totali: connessione.duplicati_evitati_totali + esito.duplicati_evitati,
      ...(esito.saldo !== null ? { saldo_provider: esito.saldo } : {}),
    });

    await registraAudit({
      userId,
      evento: EVENTI.SYNC_COMPLETATA,
      entita: 'bank_connection',
      entitaId: connessione.id,
      metadata: {
        origine,
        importati: esito.importati,
        duplicati_evitati: esito.duplicati_evitati,
        scartate: esito.scartate,
        in_attesa_presso_banca: esito.pending,
      },
    });

    // Un import può sfondare più budget in un colpo solo: le soglie vanno
    // rivalutate subito, fuori dalla transazione e senza poter lanciare
    // (stessa regola dell'hook post-movimento).
    if (esito.importati > 0) {
      await valutaBudgetDopoMovimento(userId);
    }

    return {
      esito: 'ok',
      ...esito,
      ultima_sincronizzazione: new Date(),
      // Nessuna transazione non è un errore: un conto può non avere
      // movimenti nella finestra richiesta.
      avviso: esito.importati === 0 && esito.duplicati_evitati === 0 ? ERR_NO_TRANSACTIONS : null,
    };
  } catch (error) {
    const codice = error instanceof BankProviderError || error instanceof SyncError
      ? error.codice
      : ERR_SYNC_FAILED;

    // INVARIANTE: nessun movimento e nessun saldo vengono toccati qui.
    // `last_successful_sync_at` resta quello di prima, ed è ciò che permette
    // all'interfaccia di mostrare i dati vecchi con un avviso invece di
    // svuotare la pagina.
    await connessione.update({
      status: statoDopoErrore(codice),
      last_sync_at: new Date(),
      last_error_at: new Date(),
      error_code: codice,
      sync_errori_totali: connessione.sync_errori_totali + 1,
    }).catch(() => {});

    await registraAudit({
      userId,
      evento: EVENTI.SYNC_FALLITA,
      entita: 'bank_connection',
      entitaId: connessione.id,
      esito: ESITI.ERRORE,
      metadata: { origine, codice },
    });

    logger.warn('Sincronizzazione bancaria fallita', {
      user_id: userId, connessione_id: connessione.id, codice,
    });

    throw error instanceof SyncError || error instanceof BankProviderError
      ? error
      : new SyncError(ERR_SYNC_FAILED, 'Sincronizzazione non riuscita', { statusCode: 502 });
  } finally {
    await rilasciaLock(connessione.id);
  }
}

/**
 * Normalizza, deduplica, categorizza e scrive. Separata da `sincronizza` per
 * essere verificabile da sola, con transazioni date in input.
 */
async function importaTransazioni({ userId, connessione, risposta }) {
  const { movimenti: candidati, scartate } = normalizzaTransazioni({
    transazioni: [...(risposta.booked || []), ...(risposta.pending || [])],
    contoId: connessione.conto_id,
    connectionId: connessione.id,
    valutaConto: connessione.valuta,
  });

  const pending = (risposta.pending || []).length;

  if (candidati.length === 0) {
    const saldo = risposta.saldo ?? null;
    if (saldo !== null) await allineaSaldo({ userId, connessione, saldo });
    return {
      importati: 0, duplicati_evitati: 0, scartate, pending, saldo, da_verificare: 0,
    };
  }

  // ─── Deduplica livello 2: gli id già presenti ─────────────────────────
  const idEsterni = candidati.map((c) => c.external_transaction_id).filter(Boolean);
  const giaPresenti = new Set();
  if (idEsterni.length > 0) {
    const righe = await Movimento.findAll({
      where: {
        user_id: userId,
        bank_connection_id: connessione.id,
        external_transaction_id: { [Op.in]: idEsterni },
      },
      attributes: ['external_transaction_id'],
    });
    righe.forEach((r) => giaPresenti.add(r.external_transaction_id));
  }

  // Doppioni dentro lo stesso batch (il provider può ripetere una riga).
  const vistiNelBatch = new Set();
  const conIdStabile = [];
  const senzaIdStabile = [];
  let duplicatiEvitati = 0;

  candidati.forEach((c) => {
    if (c.external_transaction_id) {
      if (giaPresenti.has(c.external_transaction_id) || vistiNelBatch.has(c.external_transaction_id)) {
        duplicatiEvitati += 1;
        return;
      }
      vistiNelBatch.add(c.external_transaction_id);
      conIdStabile.push(c);
    } else {
      senzaIdStabile.push(c);
    }
  });

  // ─── Deduplica livello 3: solo per chi non ha un id stabile ───────────
  // Chi ha un id NON passa da qui: l'id dice già che è un'operazione
  // distinta, e il confronto per somiglianza scarterebbe per sbaglio due
  // acquisti identici legittimi dello stesso giorno.
  const daImportare = [...conIdStabile];
  if (senzaIdStabile.length > 0) {
    const verificati = await new DuplicateChecker().check(userId, senzaIdStabile);
    verificati.forEach((v) => {
      if (v.isDuplicate) duplicatiEvitati += 1;
      else daImportare.push(v);
    });
  }

  if (daImportare.length === 0) {
    const saldo = risposta.saldo ?? null;
    if (saldo !== null) await allineaSaldo({ userId, connessione, saldo });
    return {
      importati: 0, duplicati_evitati: duplicatiEvitati, scartate, pending, saldo, da_verificare: 0,
    };
  }

  // ─── Categorizzazione: la cascata esistente, non una seconda ──────────
  const matcher = new CategoryMatcherService();
  const risultati = await matcher.matchBatch({ userId, transactions: daImportare });
  const perId = new Map(risultati.map((r) => [r.clientTxId, r]));

  let importati = 0;
  let daVerificare = 0;

  await sequelize.transaction(async (transaction) => {
    const conto = await Conto.findOne({
      where: { id: connessione.conto_id, user_id: userId, attivo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!conto) {
      throw new SyncError(ERR_SYNC_FAILED, 'Il conto collegato non è più disponibile.');
    }

    // Caricate una volta sola: `assertCategory` gira per ogni riga.
    const hiddenDefaults = await loadHiddenDefaults(userId, { transaction });

    for (const mov of daImportare) {
      const match = perId.get(mov.clientTxId) || {};
      // `_finalize` garantisce una categoria compatibile oppure
      // 'da_verificare', che è di sistema e quindi sempre valida: la
      // categoria eliminata dall'utente non può rientrare da questa strada
      // (Regola 18).
      const categoria = match.categoria || 'da_verificare';
      await assertCategory(userId, categoria, mov.tipo, { transaction, hiddenDefaults });

      if (categoria === 'da_verificare') daVerificare += 1;

      await Movimento.create({
        user_id: userId,
        conto_id: conto.id,
        tipo: mov.tipo,
        importo: mov.importo,
        categoria,
        categoria_automatica: true,
        categoria_confidenza: match.confidenza ?? null,
        categoria_modificata: false,
        categoria_fonte: String(match.source || 'open_banking').slice(0, 40),
        descrizione: mov.descrizione,
        data: mov.data,
        ricorrente: false,
        ricorrente_frequenza: null,
        ricorrente_giorno: null,
        // Provenienza: è ciò che rende possibile sapere quali righe ha
        // portato questa connessione, e quindi offrire in modo onesto
        // "elimina anche i dati importati".
        origine: ORIGINE_OPEN_BANKING,
        bank_connection_id: connessione.id,
        external_transaction_id: mov.external_transaction_id,
        stato_banca: TX_BOOKED,
      }, { transaction });

      importati += 1;
    }

    // ─── Saldo ──────────────────────────────────────────────────────────
    // Per un conto sincronizzato la verità sul saldo la dice la banca, non
    // la somma dei movimenti: la finestra può essere parziale e sovrapposta.
    // Se il provider non restituisce il saldo corrente, conserviamo quello
    // noto invece di stimarlo dal delta incompleto dei movimenti importati.
    if (risposta.saldo !== null && risposta.saldo !== undefined) {
      await aggiornaSaldoConto(conto, Math.round(Number(risposta.saldo) * 100) / 100, transaction);
    }
  });

  return {
    importati,
    duplicati_evitati: duplicatiEvitati,
    scartate,
    pending,
    saldo: risposta.saldo ?? null,
    da_verificare: daVerificare,
  };
}

/** Allinea il solo saldo, quando non c'è nulla da importare. */
async function allineaSaldo({ userId, connessione, saldo }) {
  await sequelize.transaction(async (transaction) => {
    const conto = await Conto.findOne({
      where: { id: connessione.conto_id, user_id: userId, attivo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!conto) return;
    await aggiornaSaldoConto(conto, Math.round(Number(saldo) * 100) / 100, transaction);
  });
}

module.exports = {
  SyncError,
  sincronizza,
  dataSuggeritaImport,
  importaTransazioni,
  acquisisciLock,
  rilasciaLock,
  statoDopoErrore,
};
