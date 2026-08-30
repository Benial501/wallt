const express = require('express');
const { getBudget, createBudget, updateBudget, getStatoBudget } = require('../controllers/budget.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateBudget,
  validateUpdateBudget,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/:anno/:mese/stato', authMiddleware, getStatoBudget);
router.get('/:anno/:mese', authMiddleware, getBudget);
router.post('/', authMiddleware, validateBudget, createBudget);
router.put('/:id', authMiddleware, validateUpdateBudget, updateBudget);

module.exports = router;
