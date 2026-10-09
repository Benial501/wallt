const express = require('express');
const {
  getPiattaforme, createPiattaforma, updatePiattaforma, deletePiattaforma,
  addMovimentoScommesse, getMovimentiScommesse, getPanoramica, getAnalisiScommesse,
  getDaConfermare, confermaDaConfermare, archiviaDaConfermare,
} = require('../controllers/scommesse.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { blockScommesseAccess } = require('../middleware/featureAccess.middleware');
const {
  validatePiattaformaScommesse,
  validateUpdatePiattaformaScommesse,
  validateDeletePiattaformaScommesse,
  validateMovimentoScommesse,
  validateMovimentiScommesseQuery,
  validateContoDaConfermare,
  validateConfermaDaConfermare,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.use(authMiddleware, blockScommesseAccess);

router.get('/panoramica', getPanoramica);
router.get('/analisi', validateMovimentiScommesseQuery, getAnalisiScommesse);
router.get('/piattaforme', getPiattaforme);
router.post('/piattaforme', validatePiattaformaScommesse, createPiattaforma);
router.put('/piattaforme/:id', validateUpdatePiattaformaScommesse, updatePiattaforma);
router.delete('/piattaforme/:id', validateDeletePiattaformaScommesse, deletePiattaforma);
router.get('/movimenti', validateMovimentiScommesseQuery, getMovimentiScommesse);
router.post('/movimenti', validateMovimentoScommesse, addMovimentoScommesse);
router.get('/da-confermare', getDaConfermare);
router.post('/da-confermare/:id/conferma', validateConfermaDaConfermare, confermaDaConfermare);
router.post('/da-confermare/:id/archivia', validateContoDaConfermare, archiviaDaConfermare);

module.exports = router;
