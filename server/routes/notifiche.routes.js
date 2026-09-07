const express = require('express');
const {
  getNotifiche,
  getNonLette,
  segnaLetta,
  segnaTutteLette,
  getPreferenze,
  updatePreferenze,
  registraPush,
  rimuoviPush,
  segnaGiornataControllata,
  generaNotifiche,
} = require('../controllers/notifiche.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateIdParam,
  validateNotificheQuery,
  validateUpdatePreferenzeNotifiche,
  validatePushSubscription,
  validateRimuoviPushSubscription,
} = require('../middleware/validation.middleware');

const router = express.Router();

// Tutte le rotte richiedono autenticazione: il centro notifiche non ha
// alcuna parte pubblica. L'utente è sempre quello del JWT.
router.use(authMiddleware);

router.get('/', validateNotificheQuery, getNotifiche);
router.get('/non-lette', getNonLette);
router.get('/preferenze', getPreferenze);
router.put('/preferenze', validateUpdatePreferenzeNotifiche, updatePreferenze);
router.post('/push', validatePushSubscription, registraPush);
router.delete('/push', validateRimuoviPushSubscription, rimuoviPush);
router.post('/giornata-controllata', segnaGiornataControllata);
router.post('/genera', generaNotifiche);
// `/lette` va dichiarata prima di `/:id/letta` non per conflitto di path, ma
// per tenere insieme le due rotte di lettura massiva.
router.put('/lette', segnaTutteLette);
router.put('/:id/letta', validateIdParam, segnaLetta);

module.exports = router;
