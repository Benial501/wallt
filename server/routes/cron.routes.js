const express = require('express');
const { requireCronSecret } = require('../middleware/cronAuth.middleware');
const {
  processaMovimentiRicorrenti,
  processaNotificheUtenti,
  processaSincronizzazioniBancarie,
} = require('../controllers/cron.controller');

const router = express.Router();

router.get('/ricorrenti', requireCronSecret, processaMovimentiRicorrenti);
router.get('/notifiche', requireCronSecret, processaNotificheUtenti);
router.get('/bank-sync', requireCronSecret, processaSincronizzazioniBancarie);

module.exports = router;
