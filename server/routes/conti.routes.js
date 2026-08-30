const express = require('express');
const {
  getConti, createConto, updateConto, deleteConto,
  getPatrimonioTotale, trasferimento,
} = require('../controllers/conti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateConto,
  validateUpdateConto,
  validateDeleteConto,
  validateTrasferimento,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/patrimonio', authMiddleware, getPatrimonioTotale);
router.post('/trasferimento', authMiddleware, validateTrasferimento, trasferimento);
router.get('/', authMiddleware, getConti);
router.post('/', authMiddleware, validateConto, createConto);
router.put('/:id', authMiddleware, validateUpdateConto, updateConto);
router.delete('/:id', authMiddleware, validateDeleteConto, deleteConto);

module.exports = router;
