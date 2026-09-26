const express = require('express');
const { getFondo, createFondo, updateFondo } = require('../controllers/fondoEmergenza.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateCreateFondoEmergenza,
  validateUpdateFondoEmergenza,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/', authMiddleware, getFondo);
router.post('/', authMiddleware, validateCreateFondoEmergenza, createFondo);
router.patch('/', authMiddleware, validateUpdateFondoEmergenza, updateFondo);

module.exports = router;
