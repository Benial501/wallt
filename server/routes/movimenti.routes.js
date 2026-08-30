const express = require('express');
const {
  getMovimenti, createMovimento, updateMovimento, deleteMovimento,
  getBilancioMese, getRicorrenti,
} = require('../controllers/movimenti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateMovimento,
  validateUpdateMovimento,
  validateDeleteMovimento,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/bilancio', authMiddleware, getBilancioMese);
router.get('/ricorrenti', authMiddleware, getRicorrenti);
router.get('/', authMiddleware, getMovimenti);
router.post('/', authMiddleware, validateMovimento, createMovimento);
router.put('/:id', authMiddleware, validateUpdateMovimento, updateMovimento);
router.delete('/:id', authMiddleware, validateDeleteMovimento, deleteMovimento);

module.exports = router;
