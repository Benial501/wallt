const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { preview, save, listActions, updateAction } = require('../controllers/pianoSmartV2.controller');

const router = express.Router();
router.post('/preview', authMiddleware, preview);
router.post('/', authMiddleware, save);
router.get('/:id/actions', authMiddleware, listActions);
router.patch('/:id/actions/:actionId', authMiddleware, updateAction);

module.exports = router;
