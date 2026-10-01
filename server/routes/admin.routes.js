const express = require('express');
const admin = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { adminLimiter } = require('../middleware/rateLimit.middleware');
const {
  validateIdParam,
  validateAdminEntitlement,
  validateAdminConfig,
  validateAdminUtentiQuery,
  validateAdminRichiestaDecisione,
  validateAdminRichiesteQuery,
} = require('../middleware/validation.middleware');

const router = express.Router();

// `requireAdmin` su TUTTO il router, non rotta per rotta: una rotta aggiunta
// domani senza ricordarsi del middleware sarebbe aperta a chiunque abbia un
// account. Qui non può succedere.
//
// Il rate limit sta fra autenticazione e verifica del ruolo: la sua chiave è
// `req.userId` (quindi serve l'autenticazione) e deve valere anche per chi
// NON è amministratore, così sondare l'area di amministrazione in ciclo
// costa come qualunque altra richiesta limitata.
router.use(authMiddleware, adminLimiter, requireAdmin);

router.get('/riepilogo', admin.getRiepilogo);
router.get('/utenti', validateAdminUtentiQuery, admin.getUtenti);
router.get('/utenti/:id/bank-sync', validateIdParam, admin.getStatoUtente);
router.post('/utenti/:id/scollega-banca', validateIdParam, admin.scollegaBancaUtente);

router.post('/entitlements/grant', validateAdminEntitlement, admin.grant);
router.post('/entitlements/revoke', validateAdminEntitlement, admin.revoke);

// Richieste di accesso a Premium. Stanno qui e non in `/api/premium`
// perché approvare e rifiutare sono azioni amministrative: nel router
// dell'utente sarebbero raggiungibili da chiunque abbia un account, e
// nessuna validazione del corpo lo impedirebbe.
router.get('/richieste-premium', validateAdminRichiesteQuery, admin.getRichiestePremium);
router.post('/richieste-premium/:id/approva', validateAdminRichiestaDecisione, admin.approvaRichiesta);
router.post('/richieste-premium/:id/rifiuta', validateAdminRichiestaDecisione, admin.rifiutaRichiesta);

router.get('/config', admin.getConfigurazione);
router.put('/config', validateAdminConfig, admin.setConfigurazione);

router.get('/audit', admin.getAudit);

module.exports = router;
