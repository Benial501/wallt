const express = require('express');
const { getPiano } = require('../controllers/piano.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Una sola rotta, di sola lettura: piano commerciale, entitlement, posti
// beta e disponibilità dei pagamenti in una risposta coerente. Non esiste
// nessuna rotta con cui un utente possa cambiare il proprio piano: il piano
// si deriva dagli abbonamenti e dagli entitlement, e nessuno dei due è
// scrivibile dal client.
router.get('/', authMiddleware, getPiano);

module.exports = router;
