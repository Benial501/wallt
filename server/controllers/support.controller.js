const { User } = require('../models');
const { sendSupportRequest, sendPublicContactRequest } = require('../services/email/SupportEmailService');
const { logWarn } = require('../utils/logger');

const sendSupport = async (req, res) => {
  try {
    // Identità letta dal DB dopo la verifica JWT; il body non può cambiarla.
    const user = await User.findByPk(req.userId, { attributes: ['id', 'email'] });
    if (!user) return res.status(401).json({ error: 'Sessione scaduta. Effettua di nuovo il login.' });
    const result = await sendSupportRequest({ user, ...req.supportData });
    if (!result.confirmationSent) logWarn('Conferma email supporto non inviata');
    return res.status(200).json({ message: 'Richiesta inviata', ...result });
  } catch (error) {
    // Non registrare errori SMTP grezzi: possono contenere credenziali o dati
    // utente. Il solo `reason` basta a distinguere configurazione mancante,
    // credenziali rifiutate e rete bloccata, e non lascia mai il server.
    const reason = error?.reason || 'unknown';
    // Il motivo sta anche nel testo del messaggio: diversi visualizzatori di log
    // collassano `meta`, e lo renderebbero illeggibile proprio quando serve.
    logWarn(`Invio email supporto non riuscito [${reason}]`, { reason });
    return res.status(502).json({ error: 'Non siamo riusciti a inviare la richiesta. Riprova.' });
  }
};

/**
 * Contatto dal sito, senza login. L'identita' non e' verificabile: l'indirizzo
 * lo dichiara chi compila, e il servizio lo segnala nell'email al supporto.
 * Nessuna conferma parte verso quell'indirizzo, per non farne un amplificatore.
 */
const sendContatto = async (req, res) => {
  try {
    await sendPublicContactRequest(req.contattoData);
    return res.status(200).json({ message: 'Richiesta inviata' });
  } catch (error) {
    const reason = error?.reason || 'unknown';
    logWarn(`Invio contatto pubblico non riuscito [${reason}]`, { reason });
    return res.status(502).json({ error: 'Non siamo riusciti a inviare la richiesta. Riprova.' });
  }
};

module.exports = { sendSupport, sendContatto };
