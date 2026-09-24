const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const { preview } = require('../controllers/pianoSmartV2.controller');

const router = express.Router();
router.post('/preview', authMiddleware, preview);

module.exports = router;
