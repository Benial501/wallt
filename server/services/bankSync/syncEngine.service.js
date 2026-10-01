const { Op, QueryTypes } = require('sequelize');
const {
  sequelize, BankConnection, Conto, Movimento,
} = require('../../models');
const logger = require('../../utils/logger');
const {
  STATO_ATTIVA, STATO_CONSENSO_SCADUTO, STATO_ERRORE, STATI_SINCRONIZZABILI,
  SYNC_LOCK_SCADENZA_MINUTI, GIORNI_STORICO_INIZIALE, GIORNI_STORICO_INCREMENTALE,
  ERR_SYNC_IN_CORSO, ERR_COOLDOWN, ERR_SYNC_FAILED, ERR_NO_TRANSACTIONS,
  ERR_CONSENT_EXPIRED, ERR_AUTHORIZATION_REVOKED, ORIGINE_OPEN_BANKING, TX_BOOKED,
} = require('../../constants/bankSync');
const { BANK_SYNC_COOLDOWN_SECONDI } = require('../../constants/appConfig');
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
 */
async function sincronizza({
  userId, connectionId = null, origine = 'manuale', provider = null, ignoraCooldown = false,
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

  await registraAudit({
    userId,
    evento: EVENTI.SYNC_AVVIATA,
    entita: 'bank_connection',
    entitaId: connessione.id,
    metadata: { origine, giorni_richiesti: giorni, prima_sincronizzazione: primaVolta },
  });

  try {
    // ─── 1. Provider ────────────────────────────────────────────────────
    // Sincronizzazione incrementale: solo la finestra necessaria, non tutta
    // la cronologia a ogni passaggio. La sovrapposizione con l'ultima sync è
    // voluta — una transazione può essere contabilizzata con giorni di
    // ritardo — e la deduplica la rende gratuita.
    const risposta = await adapter.getTransactions({
      providerAccountId: connessione.provider_account_id,
      dataDa: giorniPrimaISO(giorni),
      dataA: oggiISO(),
    });

    const esito = await importaTransazioni({ userId, connessione, risposta });

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
    // la somma dei movimenti: la finestra importata copre 90 giorni, quindi
    // una somma sarebbe sbagliata per costruzione. Quando la banca non
    // dichiara un saldo, il saldo viene mosso del delta delle righe appena
    // scritte.
    if (risposta.saldo !== null && risposta.saldo !== undefined) {
      await aggiornaSaldoConto(conto, Math.round(Number(risposta.saldo) * 100) / 100, transaction);
    } else {
      const delta = daImportare.reduce(
        (somma, m) => somma + (m.tipo === 'entrata' ? m.importo : -m.importo), 0,
      );
      const nuovo = Math.round((Number(conto.saldo) + delta) * 100) / 100;
      await aggiornaSaldoConto(conto, nuovo, transaction);
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
  importaTransazioni,
  acquisisciLock,
  rilasciaLock,
  statoDopoErrore,
};
