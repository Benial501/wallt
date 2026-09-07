const express = require('express');
const {
  getDistribuzioneSpese, getDistribuzioneEntrate, getConfrontoMesi,
  getAndamentoPatrimonio, getSuggerimenti,
} = require('../controllers/analisi.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateAnalisiQuery } = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/distribuzione-spese', authMiddleware, validateAnalisiQuery, getDistribuzioneSpese);
router.get('/distribuzione-entrate', authMiddleware, validateAnalisiQuery, getDistribuzioneEntrate);
router.get('/confronto-mesi', authMiddleware, getConfrontoMesi);
router.get('/andamento-patrimonio', authMiddleware, getAndamentoPatrimonio);
router.get('/suggerimenti', authMiddleware, getSuggerimenti);

module.exports = router;
