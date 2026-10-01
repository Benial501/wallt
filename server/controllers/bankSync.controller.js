const logger = require('../utils/logger');
const { FEATURE_BANK_SYNC } = require('../constants/entitlements');
const { ERR_PROVIDER, ERR_CONFIG } = require('../constants/bankSync');
const { BankProviderError } = require('../services/bankSync/providers/BankProvider');
const { SyncError, sincronizza } = require('../services/bankSync/syncEngine.service');
const connessioni = require('../services/bankSync/connections.service');
const { claimBetaSlot, ESITI_CLAIM, statoSlot } = require('../services/betaSlots.service');
const { canUseFeature } = require('../services/entitlements.service');

/**
 * Rotte di Bank Sync.
 *
 * ── Cosa garantisce ogni rotta, e dove ───────────────────────────────────
 *  • sessione valida e utente autenticato → `authMiddleware` (nella route);
 *  • entitlement valido → `requireFeature('bank_sync')` (nella route);
 *  • proprietà della risorsa → nei servizi, che filtrano SEMPRE per
 *    `user_id`: non esiste una query su una connessione che non includa
 *    l'utente, quindi non esiste un `connection_id` manipolabile che porti
 *    ai dati di un altro;
 *  • limite di un conto → indice parziale nel database + controllo nel
 *    servizio;
 *  • validazione input → `validation.middleware` (nella route);
 *  • rate limit → `rateLimit.middleware` (nella route).
 *
 * `claim-beta` è l'unica rotta che NON passa da `requireFeature`: è la rotta
 * che serve a ottenere il permesso, e richiederlo per usarla sarebbe
 * circolare. Ha però il suo controllo: solo `beta_25`, solo dentro il lock
 * dei posti, e nessun parametro dal client.
 *
 * ── Gli errori ───────────────────────────────────────────────────────────
 * All'utente arriva sempre un `codice` stabile, mai lo stack, mai la risposta
 * HTTP grezza del provider, mai un suo segreto. Il codice è ciò che permette
 * alla SPA di distinguere "connessione scaduta → Ricollega" da "la banca non
 * risponde → Riprova": un 500 generico renderebbe le due situazioni
 * indistinguibili, ed è il difetto che il brief chiede di evitare.
 */

/** Traduce un errore interno in risposta, senza far uscire dettagli tecnici. */
const rispondiErrore = (res, error, contesto) => {
  if (error instanceof SyncError || error instanceof BankProviderError) {
    const stato = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502;
    // Un problema di configurazione non è colpa dell'utente e non va
    // raccontato come un errore della sua banca.
    const messaggio = error.codice === ERR_CONFIG
      ? 'La sincronizzazione bancaria non è ancora configurata su questo ambiente.'
      : error.message;
    logger.warn('Errore Bank Sync', { contesto, codice: error.codice });
    return res.status(stato).json({
      error: 'Sincronizzazione bancaria',
      message: messaggio,
      codice: error.codice,
      ...(error.dettagli ? { dettagli: error.dettagli } : {}),
    });
  }

  if (error?.statusCode >= 400 && error?.statusCode < 500) {
    return res.status(error.statusCode).json({
      error: 'Richiesta non valida',
      message: error.message,
      ...(error.codice ? { codice: error.codice } : {}),
    });
  }

  logger.error('Errore inatteso Bank Sync', { contesto, err: error });
  return res.status(500).json({
    error: 'Errore',
    message: 'Non è stato possibile completare l\'operazione. I tuoi dati non sono stati modificati.',
    codice: ERR_PROVIDER,
  });
};

/** `GET /api/bank-sync/status` — lo stato della connessione dell'utente. */
const getStato = async (req, res) => {
  try {
    const [stato, permesso] = await Promise.all([
      connessioni.statoConnessione(req.userId),
      canUseFeature(req.userId, FEATURE_BANK_SYNC),
    ]);
    res.json({
      ...stato,
      permesso: {
        attiva: permesso.consentito,
        motivo: permesso.motivo,
        source: permesso.source,
      },
    });
  } catch (error) {
    rispondiErrore(res, error, 'status');
  }
};

/** `GET /api/bank-sync/istituti` — le banche collegabili. */
const getIstituti = async (req, res) => {
  try {
    const istituti = await connessioni.istitutiDisponibili({ paese: req.query.paese || 'IT' });
    res.json({ istituti });
  } catch (error) {
    rispondiErrore(res, error, 'istituti');
  }
};

/**
 * `POST /api/bank-sync/claim-beta` — attiva gratuitamente Premium Beta.
 *
 * Nessun parametro: feature e origine sono cablate nel servizio. Il posto
 * viene assegnato solo qui, solo dopo un click esplicito dell'utente, e solo
 * dentro il lock che conta i posti.
 */
const claimBeta = async (req, res) => {
  try {
    const esito = await claimBetaSlot(req.userId, { featureKey: FEATURE_BANK_SYNC });

    if (esito.esito === ESITI_CLAIM.ASSEGNATO || esito.esito === ESITI_CLAIM.GIA_ATTIVO) {
      return res.status(esito.esito === ESITI_CLAIM.ASSEGNATO ? 201 : 200).json({
        esito: esito.esito,
        attivato: true,
        message: esito.esito === ESITI_CLAIM.ASSEGNATO
          ? 'WALLT Premium Beta attivato. Ora puoi collegare il tuo conto bancario.'
          : 'Hai già accesso alla sincronizzazione bancaria.',
        beta: esito.slot,
      });
    }

    const messaggi = {
      [ESITI_CLAIM.POSTI_ESAURITI]:
        'I posti della beta gratuita sono esauriti. La sincronizzazione bancaria sarà disponibile con WALLT Premium.',
      [ESITI_CLAIM.BETA_CHIUSA]:
        'Le attivazioni gratuite sono chiuse. La sincronizzazione bancaria sarà disponibile con WALLT Premium.',
      [ESITI_CLAIM.FEATURE_DISATTIVATA]:
        'La sincronizzazione bancaria è momentaneamente sospesa. Riprova più tardi.',
    };

    return res.status(409).json({
      esito: esito.esito,
      attivato: false,
      message: messaggi[esito.esito] ?? 'Attivazione non disponibile.',
      beta: esito.slot,
    });
  } catch (error) {
    return rispondiErrore(res, error, 'claim-beta');
  }
};

/** `POST /api/bank-sync/connect` — avvia l'autorizzazione presso la banca. */
const connect = async (req, res) => {
  try {
    const esito = await connessioni.avviaConnessione({
      userId: req.userId,
      institutionId: req.body.institution_id,
      sostituisci: !!req.body.sostituisci,
    });
    res.status(201).json(esito);
  } catch (error) {
    rispondiErrore(res, error, 'connect');
  }
};

/**
 * `POST /api/bank-sync/reconnect` — rinnova l'autorizzazione della banca
 * già collegata, senza che l'utente debba ricercarla.
 *
 * Non è un `connect` con un parametro in più: l'istituto viene letto dalla
 * connessione esistente dell'utente, non dal corpo della richiesta. Così
 * "ricollega" non può diventare un modo per collegare una banca diversa
 * saltando la conferma di sostituzione.
 */
const reconnect = async (req, res) => {
  try {
    const connessione = await connessioni.trovaConnessioneViva(req.userId);
    if (!connessione) {
      return res.status(404).json({
        error: 'Nessun conto collegato',
        message: 'Non hai un conto bancario da ricollegare.',
      });
    }

    const esito = await connessioni.avviaConnessione({
      userId: req.userId,
      institutionId: connessione.institution_id,
      sostituisci: true,
    });
    return res.status(201).json(esito);
  } catch (error) {
    return rispondiErrore(res, error, 'reconnect');
  }
};

/** `POST /api/bank-sync/callback` — completa il collegamento. */
const callback = async (req, res) => {
  try {
    const esito = await connessioni.completaConnessione({
      userId: req.userId,
      state: req.body.state,
    });
    res.status(esito.ripetuto ? 200 : 201).json({
      ...esito,
      message: 'Conto bancario collegato. La prima sincronizzazione importerà gli ultimi 90 giorni.',
    });
  } catch (error) {
    rispondiErrore(res, error, 'callback');
  }
};

/** `POST /api/bank-sync/sync` — sincronizzazione manuale. */
const sync = async (req, res) => {
  try {
    const esito = await sincronizza({ userId: req.userId, origine: 'manuale' });
    const stato = await connessioni.statoConnessione(req.userId);
    res.json({ ...esito, ...stato });
  } catch (error) {
    rispondiErrore(res, error, 'sync');
  }
};

/** `POST /api/bank-sync/disconnect` — scollega. Non cancella movimenti. */
const disconnect = async (req, res) => {
  try {
    const esito = await connessioni.scollega({ userId: req.userId });
    res.json({
      ...esito,
      message: 'Conto bancario scollegato. I movimenti già importati restano disponibili.',
    });
  } catch (error) {
    rispondiErrore(res, error, 'disconnect');
  }
};

/**
 * `DELETE /api/bank-sync/dati-importati` — cancella i movimenti importati.
 *
 * Azione distruttiva e separata dallo scollegamento, dietro riverifica
 * d'identità (`requireStepUp`, come reset e cancellazione account). Non si
 * attiva per sbaglio e non è un effetto collaterale di nient'altro.
 */
const eliminaDatiImportati = async (req, res) => {
  try {
    const esito = await connessioni.eliminaDatiImportati({ userId: req.userId });
    res.json({
      ...esito,
      message: `Eliminati ${esito.movimenti_eliminati} movimenti importati dalla banca.`,
    });
  } catch (error) {
    rispondiErrore(res, error, 'elimina-dati-importati');
  }
};

/** `GET /api/bank-sync/beta` — i posti rimasti. Pubblica agli autenticati:
 * è un dato aggregato di prodotto, non personale. */
const getBeta = async (req, res) => {
  try {
    res.json(await statoSlot(FEATURE_BANK_SYNC));
  } catch (error) {
    rispondiErrore(res, error, 'beta');
  }
};

module.exports = {
  getStato,
  getIstituti,
  getBeta,
  claimBeta,
  connect,
  reconnect,
  callback,
  sync,
  disconnect,
  eliminaDatiImportati,
};
