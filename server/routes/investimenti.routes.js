const express = require('express');
const {
  getInvestimenti, createInvestimento, updateInvestimento, deleteInvestimento,
  addMovimentoInvestimento, getMovimentiInvestimento, getAnalisiInvestimenti,
} = require('../controllers/investimenti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { blockInvestimentiAccess } = require('../middleware/featureAccess.middleware');
const {
  validateInvestimento,
  validateUpdateInvestimento,
  validateDeleteInvestimento,
  validateMovimentoInvestimento,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.use(authMiddleware, blockInvestimentiAccess);

router.get('/analisi', getAnalisiInvestimenti);
router.get('/', getInvestimenti);
router.post('/', validateInvestimento, createInvestimento);
router.put('/:id', validateUpdateInvestimento, updateInvestimento);
router.delete('/:id', validateDeleteInvestimento, deleteInvestimento);
router.post('/:id/movimenti', validateMovimentoInvestimento, addMovimentoInvestimento);
router.get('/:id/movimenti', getMovimentiInvestimento);

module.exports = router;
