const express = require('express');
const {
  getAbbonamenti,
  createAbbonamento,
  updateAbbonamento,
  annullaAbbonamento,
  escludiAbbonamento,
  ripristinaAbbonamento,
} = require('../controllers/abbonamenti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateAbbonamento,
  validateUpdateAbbonamento,
  validateIdParam,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getAbbonamenti);
router.post('/', authMiddleware, validateAbbonamento, createAbbonamento);
router.put('/:id', authMiddleware, validateUpdateAbbonamento, updateAbbonamento);
router.patch('/:id/annulla', authMiddleware, validateIdParam, annullaAbbonamento);
router.patch('/:id/escludi', authMiddleware, validateIdParam, escludiAbbonamento);
router.patch('/:id/ripristina', authMiddleware, validateIdParam, ripristinaAbbonamento);

module.exports = router;
