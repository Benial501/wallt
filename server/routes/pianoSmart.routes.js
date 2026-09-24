const express = require('express');
const {
  getReadinessHandler,
  previewPiano,
  createPiano,
  listPiani,
  getPiano,
  updatePiano,
} = require('../controllers/pianoSmart.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { pianoSmartPreviewLimiter } = require('../middleware/rateLimit.middleware');
const {
  validatePianoSmartInput,
  validateCreatePianoSmart,
  validateUpdatePianoSmart,
  validatePianoSmartId,
} = require('../middleware/validation.middleware');

const router = express.Router();

// `authMiddleware` su ogni rotta senza eccezioni: un piano contiene aggregati
// finanziari personali, non esiste una vista pubblica. La proprietà è poi
// verificata nel controller con una WHERE su user_id, non con un confronto.
router.get('/readiness', authMiddleware, getReadinessHandler);

// La preview ha un limite proprio: espande l'intero FinancialContext a ogni
// chiamata (vedi pianoSmartPreviewLimiter).
router.post('/preview', authMiddleware, pianoSmartPreviewLimiter, validatePianoSmartInput, previewPiano);

router.get('/', authMiddleware, listPiani);
router.post('/', authMiddleware, validateCreatePianoSmart, createPiano);
router.get('/:id', authMiddleware, validatePianoSmartId, getPiano);

// Un solo PATCH per allocazioni finali e stato: il client chiama
// `updatePlan(id, payload)` con `{ status }` o `{ allocations }` (vedi
// docs/piano-smart-api-contract.md). Nessun DELETE: l'archiviazione è una
// transizione di stato, così il piano resta verificabile.
router.patch('/:id', authMiddleware, validateUpdatePianoSmart, updatePiano);

module.exports = router;
