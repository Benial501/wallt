const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { preview, save } = require('../controllers/pianoSmartV2.controller');

const router = express.Router();
router.post('/preview', authMiddleware, preview);
router.post('/', authMiddleware, save);

module.exports = router;
