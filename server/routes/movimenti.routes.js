const express = require('express');
const {
  getMovimenti, createMovimento, updateMovimento, deleteMovimento,
  getBilancioMese, getRicorrenti, getEntrateRiepilogo, updateStatoRicorrenza,
} = require('../controllers/movimenti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateMovimento,
  validateUpdateMovimento,
  validateDeleteMovimento,
  validateMovimentiQuery,
  validateStatoRicorrenza,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/bilancio', authMiddleware, getBilancioMese);
router.get('/ricorrenti', authMiddleware, getRicorrenti);
router.get('/entrate/riepilogo', authMiddleware, getEntrateRiepilogo);
router.get('/', authMiddleware, validateMovimentiQuery, getMovimenti);
router.post('/', authMiddleware, validateMovimento, createMovimento);
router.patch('/:id/ricorrenza/stato', authMiddleware, validateStatoRicorrenza, updateStatoRicorrenza);
router.put('/:id', authMiddleware, validateUpdateMovimento, updateMovimento);
router.delete('/:id', authMiddleware, validateDeleteMovimento, deleteMovimento);

module.exports = router;
