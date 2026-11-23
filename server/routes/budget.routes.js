const express = require('express');
const { getPiano, salvaPiano, getStato } = require('../controllers/budget.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateBudgetPiano } = require('../middleware/validation.middleware');

const router = express.Router();

// Il piano non ha un id: è uno per persona e sta sul profilo di chi è
// autenticato, quindi nessuna rotta può toccare quello di un altro.
router.get('/piano', authMiddleware, getPiano);
router.put('/piano', authMiddleware, validateBudgetPiano, salvaPiano);
router.get('/stato', authMiddleware, getStato);

module.exports = router;
