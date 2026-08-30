const express = require('express');
const {
  getPiattaforme, createPiattaforma, updatePiattaforma, deletePiattaforma,
  addMovimentoScommesse, getMovimentiScommesse, getPanoramica, getAnalisiScommesse,
} = require('../controllers/scommesse.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { blockScommesseAccess } = require('../middleware/featureAccess.middleware');
const {
  validatePiattaformaScommesse,
  validateUpdatePiattaformaScommesse,
  validateDeletePiattaformaScommesse,
  validateMovimentoScommesse,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.use(authMiddleware, blockScommesseAccess);

router.get('/panoramica', getPanoramica);
router.get('/analisi', getAnalisiScommesse);
router.get('/piattaforme', getPiattaforme);
router.post('/piattaforme', validatePiattaformaScommesse, createPiattaforma);
router.put('/piattaforme/:id', validateUpdatePiattaformaScommesse, updatePiattaforma);
router.delete('/piattaforme/:id', validateDeletePiattaformaScommesse, deletePiattaforma);
router.get('/movimenti', getMovimentiScommesse);
router.post('/movimenti', validateMovimentoScommesse, addMovimentoScommesse);

module.exports = router;
