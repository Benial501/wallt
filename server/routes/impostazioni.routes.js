const express = require('express');
const {
  updateProfilo, updateAvatar, deleteAvatar, updatePassword, updatePreferenze,
  esportaDati, deleteAccount, resetAccount,
} = require('../controllers/impostazioni.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { requireStepUpUnlessOAuth } = require('../middleware/stepUp.middleware');
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
router.get('/esporta', authMiddleware, requireStepUpUnlessOAuth, exportLimiter, esportaDati);
router.post('/esporta', authMiddleware, requireStepUpUnlessOAuth, exportLimiter, esportaDati);
router.post('/reset-account', authMiddleware, requireStepUpUnlessOAuth, validateResetAccount, resetAccount);
router.delete('/account', authMiddleware, requireStepUpUnlessOAuth, deleteAccountLimiter, validateDeleteAccount, deleteAccount);

module.exports = router;
