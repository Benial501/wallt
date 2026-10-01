const logger = require('../utils/logger');
const { FEATURE_BANK_SYNC } = require('../constants/entitlements');
const richieste = require('../services/premiumRequests.service');

/**
 * Le richieste di accesso a Premium, lato utente.
 *
 * ── Il server non si fida di niente che arrivi da qui ────────────────────
 * `user_id` NON viene letto dal corpo della richiesta: arriva da
 * `req.userId`, cioè dal JWT verificato da `authMiddleware`. Lo stesso vale
 * per `status`, `requested_at`, `reviewed_by` e `reviewed_at`, che il
 * servizio determina da sé. Un client che li inviasse non otterrebbe
 * nulla: non esiste nessun percorso in cui quei campi vengano copiati da
 * `req.body`. È la stessa regola di `POST /bank-sync/claim-beta`, che
 * infatti non ha corpo.
 *
 * ── Una richiesta non concede niente ─────────────────────────────────────
 * Nemmeno quando i posti beta sono ancora liberi: creare una richiesta
 * produce una `pending` e basta. I posti si prendono solo dal claim, che è
 * l'unico punto che può scrivere `source: 'beta_25'` (e lo fa dentro un
 * lock). Avere due strade verso una quota a numero chiuso, una delle quali
 * non la conta, è esattamente il difetto da evitare.
 */

const MESSAGGI = Object.freeze({
  [richieste.ESITI_CREAZIONE.CREATA]:
    'Richiesta inviata. Ti faremo sapere quando potrai accedere a WALLT Premium.',
  [richieste.ESITI_CREAZIONE.RIAPERTA]:
    'Richiesta inviata. Ti faremo sapere quando potrai accedere a WALLT Premium.',
  [richieste.ESITI_CREAZIONE.GIA_INVIATA]:
    'Richiesta già inviata. Ti faremo sapere quando potrai accedere a WALLT Premium.',
  [richieste.ESITI_CREAZIONE.GIA_DECISA]:
    'La tua richiesta è già stata valutata. Ti avviseremo quando WALLT Premium sarà disponibile.',
  [richieste.ESITI_CREAZIONE.GIA_ATTIVA]:
    'Hai già accesso a WALLT Premium.',
});

const rispondiErrore = (res, error, dove) => {
  if (error?.statusCode >= 400 && error?.statusCode < 500) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  logger.error(`Errore premium ${dove}`, { err: error });
  return res.status(500).json({ message: 'Operazione non riuscita' });
};

/** `GET /api/premium/richieste` — solo le proprie. */
const getRichieste = async (req, res) => {
  try {
    const elenco = await richieste.richiesteUtente(req.userId);
    return res.json({
      richieste: elenco,
      // La richiesta che interessa alle schermate di oggi, estratta per
      // comodità: il client non deve cercarla in un array di uno.
      richiesta: elenco.find((r) => r.requested_feature === FEATURE_BANK_SYNC) ?? null,
    });
  } catch (error) {
    return rispondiErrore(res, error, 'getRichieste');
  }
};

/** `POST /api/premium/request` */
const creaRichiesta = async (req, res) => {
  try {
    const esito = await richieste.creaRichiesta({
      userId: req.userId,
      feature: req.body?.requested_feature ?? FEATURE_BANK_SYNC,
    });

    const nuova = esito.esito === richieste.ESITI_CREAZIONE.CREATA
      || esito.esito === richieste.ESITI_CREAZIONE.RIAPERTA;

    return res.status(nuova ? 201 : 200).json({
      esito: esito.esito,
      // Una seconda richiesta non è un errore: è lo stesso stato, detto di
      // nuovo. Rispondere 409 farebbe comparire un messaggio rosso a chi ha
      // semplicemente premuto due volte.
      gia_inviata: !nuova,
      richiesta: esito.richiesta,
      message: MESSAGGI[esito.esito] ?? 'Richiesta registrata.',
    });
  } catch (error) {
    return rispondiErrore(res, error, 'creaRichiesta');
  }
};

/** `DELETE /api/premium/richieste/:id` — solo la propria, solo se in attesa. */
const annullaRichiesta = async (req, res) => {
  try {
    const richiesta = await richieste.annullaRichiesta({
      userId: req.userId,
      id: Number(req.params.id),
    });
    return res.json({
      annullata: true,
      richiesta,
      message: 'Richiesta annullata. Puoi richiedere di nuovo l\'accesso quando vuoi.',
    });
  } catch (error) {
    return rispondiErrore(res, error, 'annullaRichiesta');
  }
};

module.exports = { getRichieste, creaRichiesta, annullaRichiesta };
