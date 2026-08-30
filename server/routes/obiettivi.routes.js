const express = require('express');
const {
  getObiettivi, createObiettivo, updateObiettivo, deleteObiettivo,
  addContributo, getProiezione,
} = require('../controllers/obiettivi.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateObiettivo,
  validateUpdateObiettivo,
  validateDeleteObiettivo,
  validateContributo,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getObiettivi);
router.post('/', authMiddleware, validateObiettivo, createObiettivo);
router.get('/:id/proiezione', authMiddleware, getProiezione);
router.post('/:id/contributi', authMiddleware, validateContributo, addContributo);
router.put('/:id', authMiddleware, validateUpdateObiettivo, updateObiettivo);
router.delete('/:id', authMiddleware, validateDeleteObiettivo, deleteObiettivo);

module.exports = router;
