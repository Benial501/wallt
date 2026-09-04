const express = require('express');
const { requireCronSecret } = require('../middleware/cronAuth.middleware');
const { processaMovimentiRicorrenti } = require('../controllers/cron.controller');

const router = express.Router();

router.get('/ricorrenti', requireCronSecret, processaMovimentiRicorrenti);

module.exports = router;
