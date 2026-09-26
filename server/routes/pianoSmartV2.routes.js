const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validatePianoSmartId,
  validatePianoSmartActionId,
} = require('../middleware/validation.middleware');
const { preview, currentSituation, save, listActions, updateAction, getSnapshot, getScenarios, getProjection } = require('../controllers/pianoSmartV2.controller');

const router = express.Router();
router.post('/preview', authMiddleware, preview);
router.get('/current-situation', authMiddleware, currentSituation);
router.post('/', authMiddleware, save);
router.get('/:id/scenarios', authMiddleware, validatePianoSmartId, getScenarios);
router.get('/:id/projection', authMiddleware, validatePianoSmartId, getProjection);
router.get('/:id', authMiddleware, validatePianoSmartId, getSnapshot);
router.get('/:id/actions', authMiddleware, validatePianoSmartId, listActions);
router.patch('/:id/actions/:actionId', authMiddleware, validatePianoSmartActionId, updateAction);

module.exports = router;
