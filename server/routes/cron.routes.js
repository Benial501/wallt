const express = require('express');
const { requireCronSecret } = require('../middleware/cronAuth.middleware');
const {
  processaMovimentiRicorrenti,
  processaNotificheUtenti,
} = require('../controllers/cron.controller');

const router = express.Router();

router.get('/ricorrenti', requireCronSecret, processaMovimentiRicorrenti);
router.get('/notifiche', requireCronSecret, processaNotificheUtenti);

module.exports = router;
