const express = require('express');
const {
  getDebiti, createDebito, updateDebito, deleteDebito,
} = require('../controllers/debiti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateDebito,
  validateUpdateDebito,
  validateDeleteDebito,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getDebiti);
router.post('/', authMiddleware, validateDebito, createDebito);
router.put('/:id', authMiddleware, validateUpdateDebito, updateDebito);
router.delete('/:id', authMiddleware, validateDeleteDebito, deleteDebito);

module.exports = router;
