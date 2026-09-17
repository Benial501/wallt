const express = require('express');
const {
  getObiettivi, createObiettivo, updateObiettivo, deleteObiettivo,
  addContributo, getProiezione, getCopertura,
} = require('../controllers/obiettivi.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateIdParam,
  validateObiettivo,
  validateUpdateObiettivo,
  validateDeleteObiettivo,
  validateContributo,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getObiettivi);
router.post('/', authMiddleware, validateObiettivo, createObiettivo);
router.get('/:id/proiezione', authMiddleware, validateIdParam, getProiezione);
router.get('/:id/copertura', authMiddleware, validateIdParam, getCopertura);
router.post('/:id/contributi', authMiddleware, validateContributo, addContributo);
router.put('/:id', authMiddleware, validateUpdateObiettivo, updateObiettivo);
router.delete('/:id', authMiddleware, validateDeleteObiettivo, deleteObiettivo);

module.exports = router;
