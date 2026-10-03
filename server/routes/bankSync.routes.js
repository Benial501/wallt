const express = require('express');
const bankSync = require('../controllers/bankSync.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/entitlement.middleware');
const { FEATURE_BANK_SYNC } = require('../constants/entitlements');
const {
  validateBankConnect,
  validateBankCallback,
  validateDeleteBankImportedData,
  validateBankSyncRange,
  validateRiconciliazione,
  validateIstitutiQuery,
} = require('../middleware/validation.middleware');
const {
  bankClaimLimiter,
  bankConnectLimiter,
  bankCallbackLimiter,
  bankRiconciliazioneLimiter,
  bankSyncLimiter,
  bankDangerLimiter,
} = require('../middleware/rateLimit.middleware');

const router = express.Router();

/**
 * Tutte le rotte sono autenticate. Quelle che usano la banca richiedono
 * anche l'entitlement: un utente Free che chiamasse direttamente
 * `/bank-sync/connect` riceve 403, perché la barriera è qui e non nella UI.
 *
 * L'ordine dei middleware è parte della sicurezza:
 *   autenticazione → rate limit → entitlement → validazione → controller
 *
 * Il rate limit sta DOPO l'autenticazione, come nelle altre rotte del
 * progetto (`impostazioni.routes.js`, `pianoSmart.routes.js`), perché la
 * chiave del limite è `req.userId`, che esiste solo dopo `authMiddleware`.
 * Davanti all'autenticazione la chiave ricadrebbe sull'IP, e un utente
 * dietro NAT aziendale consumerebbe la quota di tutti i colleghi. Le
 * richieste non autenticate restano coperte dal limite generale su `/api`.
 *
 * L'entitlement precede la validazione: a un utente senza permesso non serve
 * sapere se il suo `institution_id` era valido.
 */

const feature = requireFeature(FEATURE_BANK_SYNC);

// --- Sempre leggibili dall'utente autenticato ------------------------------
// Lo stato e i posti rimasti servono anche a chi NON ha il permesso: è ciò
// che permette alla pagina Conti di mostrare l'invito alla beta.
router.get('/status', authMiddleware, bankSync.getStato);
router.get('/beta', authMiddleware, bankSync.getBeta);

// --- Ottenere il permesso --------------------------------------------------
// Unica rotta senza `requireFeature`: è quella che serve a ottenerlo.
// Nessun parametro: feature e origine sono cablate nel servizio.
router.post('/claim-beta', authMiddleware, bankClaimLimiter, bankSync.claimBeta);

// --- Usare la banca (richiede il permesso) --------------------------------
router.get('/istituti', authMiddleware, feature, validateIstitutiQuery, bankSync.getIstituti);
router.get('/riconciliazione', authMiddleware, feature, bankSync.getRiconciliazione);
// Associa il collegamento a un conto: nuovo, oppure uno che l'utente già
// usa. Agganciarne uno esistente non elimina e non archivia nulla.
router.post(
  '/riconciliazione',
  authMiddleware, bankRiconciliazioneLimiter, feature, validateRiconciliazione,
  bankSync.postRiconciliazione,
);
router.post('/connect', authMiddleware, bankConnectLimiter, feature, validateBankConnect, bankSync.connect);
router.post('/reconnect', authMiddleware, bankConnectLimiter, feature, bankSync.reconnect);
router.post('/callback', authMiddleware, bankCallbackLimiter, feature, validateBankCallback, bankSync.callback);
router.post(
  '/sync', authMiddleware, bankSyncLimiter, feature, validateBankSyncRange, bankSync.sync,
);

// Scollegare NON richiede l'entitlement: chi ha perso il permesso deve
// comunque poter togliere l'autorizzazione alla propria banca. Negarglielo
// lo lascerebbe con un consenso attivo che non può revocare.
router.post('/disconnect', authMiddleware, bankSync.disconnect);

// Cancella esclusivamente i movimenti importati dell'utente autenticato.
// La conferma esplicita sostituisce lo step-up; il limite richieste resta
// attivo per contenere cancellazioni ripetute.
router.delete(
  '/dati-importati',
  authMiddleware,
  bankDangerLimiter,
  validateDeleteBankImportedData,
  bankSync.eliminaDatiImportati,
);

module.exports = router;
