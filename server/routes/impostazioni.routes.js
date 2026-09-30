const express = require('express');
const {
  updateProfilo, updateAvatar, deleteAvatar, updatePassword, updatePreferenze,
  esportaDati, deleteAccount, resetAccount,
} = require('../controllers/impostazioni.controller');
const authMiddleware = require('../middleware/auth.middleware');
// requireStepUp, non la variante che esentava gli account OAuth: queste tre
// operazioni cancellano o fanno uscire tutti i dati di una persona, e la
// riverifica dell'identita' non puo' dipendere da come si e' registrata.
// Per gli account Google la seconda prova e' un ID token fresco di Google
// Identity Services (POST /auth/verify-google), non una stringa digitata.
const { requireStepUp } = require('../middleware/stepUp.middleware');
const { exportLimiter, deleteAccountLimiter, avatarLimiter } = require('../middleware/rateLimit.middleware');
const {
  validatePassword,
  validateUpdateProfilo,
  validateUpdatePreferenze,
  validateResetAccount,
  validateDeleteAccount,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.put('/profilo', authMiddleware, validateUpdateProfilo, updateProfilo);
router.put('/avatar', authMiddleware, avatarLimiter, updateAvatar);
router.delete('/avatar', authMiddleware, avatarLimiter, deleteAvatar);
router.put('/password', authMiddleware, validatePassword, updatePassword);
router.put('/preferenze', authMiddleware, validateUpdatePreferenze, updatePreferenze);
router.get('/esporta', authMiddleware, requireStepUp, exportLimiter, esportaDati);
router.post('/esporta', authMiddleware, requireStepUp, exportLimiter, esportaDati);
router.post('/reset-account', authMiddleware, requireStepUp, validateResetAccount, resetAccount);
router.delete('/account', authMiddleware, requireStepUp, deleteAccountLimiter, validateDeleteAccount, deleteAccount);

module.exports = router;
