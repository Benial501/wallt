const express = require('express');
const premium = require('../controllers/premium.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { premiumRequestLimiter } = require('../middleware/rateLimit.middleware');
const {
  validateIdParam,
  validatePremiumRequest,
} = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * Le richieste di accesso a Premium dell'utente autenticato.
 *
 * Tre rotte e nient'altro: leggere la propria, crearla, annullarla.
 * Approvare e rifiutare NON stanno qui — stanno sotto `/api/admin`, dietro
 * `requireAdmin`. Non è una questione di organizzazione dei file: una rotta
 * di approvazione in questo router sarebbe raggiungibile da qualunque
 * utente autenticato, e nessuna validazione del corpo lo impedirebbe.
 *
 * L'ordine dei middleware ricalca quello di `bankSync.routes.js`:
 *   autenticazione → rate limit → validazione → controller
 * Il rate limit sta dopo l'autenticazione perché la sua chiave è
 * `req.userId`: davanti ricadrebbe sull'IP, e un utente dietro NAT
 * aziendale consumerebbe la quota dei colleghi.
 *
 * Il limite si applica alla sola creazione. Leggere il proprio stato è
 * un'operazione innocua che la SPA fa a ogni apertura della pagina, e
 * limitarla romperebbe l'interfaccia senza proteggere niente.
 */

router.get('/richieste', authMiddleware, premium.getRichieste);

router.post(
  '/request',
  authMiddleware,
  premiumRequestLimiter,
  validatePremiumRequest,
  premium.creaRichiesta,
);

router.delete('/richieste/:id', authMiddleware, validateIdParam, premium.annullaRichiesta);

module.exports = router;
