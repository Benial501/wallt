const express = require('express');
const { body, validationResult, matchedData } = require('express-validator');
const { createPersistentAuthLimiter } = require('../middleware/rateLimit.middleware');
const { SUPPORT_CATEGORIES } = require('../constants/supportCategories');
const { sendContatto } = require('../controllers/support.controller');

const router = express.Router();

// Rotta pubblica: senza login la chiave del limite e' l'IP normalizzato, non
// l'utente. Stessa finestra delle altre rotte persistenti, cosi' la pulizia di
// auth_rate_limits resta una sola e il limite vale su tutte le istanze Vercel.
const contattoLimiter = createPersistentAuthLimiter({
  route: 'contatto', windowMs: 15 * 60 * 1000, max: 3,
  message: { error: 'Hai inviato troppe richieste. Riprova tra 15 minuti.' },
});

router.post('/', contattoLimiter,
  body('email').isString().bail().not().matches(/[\x00-\x1f\x7f]/).bail()
    .trim().isEmail().bail()
    .isLength({ max: 254 }),
  body('category').isString().bail().trim().isIn(SUPPORT_CATEGORIES),
  body('subject').isString().bail().not().matches(/[\x00-\x1f\x7f]/).bail()
    .trim().isLength({ min: 1, max: 160 }),
  body('message').isString().bail().not().matches(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/).bail()
    .trim().isLength({ min: 1, max: 5000 }),
  (req, res, next) => {
    if (!validationResult(req).isEmpty()) {
      return res.status(400).json({ error: 'Controlla email, categoria, oggetto (massimo 160 caratteri) e messaggio (massimo 5000 caratteri).' });
    }
    req.contattoData = matchedData(req, { locations: ['body'] });
    return next();
  },
  sendContatto,
);
router.all('/', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Metodo non consentito.' }));

module.exports = router;
