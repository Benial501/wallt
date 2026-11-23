const express = require('express');
const { getProfilo, updateProfilo, skipOnboardingHandler } = require('../controllers/profilo.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateUpdateProfiloFinanziario } = require('../middleware/validation.middleware');

const router = express.Router();

router.post('/skip-onboarding', authMiddleware, skipOnboardingHandler);
router.get('/', authMiddleware, getProfilo);
router.put('/', authMiddleware, validateUpdateProfiloFinanziario, updateProfilo);

module.exports = router;
