const express = require('express');
const { body, validationResult, matchedData } = require('express-validator');
const authMiddleware = require('../middleware/auth.middleware');
const { createPersistentAuthLimiter } = require('../middleware/rateLimit.middleware');
const { sendSupport } = require('../controllers/support.controller');

const router = express.Router();
const categories = [
  'Problema tecnico', "Problema con l'account", 'Problema con entrate/uscite',
  'Suggerimento', 'Segnalazione bug', 'Altro',
];
// Stessa finestra degli altri limiter persistenti: compatibile con la pulizia
// della tabella auth_rate_limits e condiviso tra tutte le istanze Vercel.
const supportLimiter = createPersistentAuthLimiter({
  route: 'support', windowMs: 15 * 60 * 1000, max: 3,
  message: { error: 'Hai inviato troppe richieste. Riprova tra 15 minuti.' },
});

router.post('/', authMiddleware, supportLimiter,
  body('category').isString().bail().trim().isIn(categories),
  body('subject').isString().bail().not().matches(/[\x00-\x1f\x7f]/).bail()
    .trim().isLength({ min: 1, max: 160 }),
  body('message').isString().bail().not().matches(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/).bail()
    .trim().isLength({ min: 1, max: 5000 }),
  (req, res, next) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ error: 'Controlla categoria, oggetto (massimo 160 caratteri) e messaggio (massimo 5000 caratteri).' });
    }
    req.supportData = matchedData(req, { locations: ['body'] });
    return next();
  },
  sendSupport,
);
router.all('/', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Metodo non consentito.' }));

module.exports = router;
