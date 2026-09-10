const { User } = require('../models');
const { sendSupportRequest } = require('../services/email/SupportEmailService');
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
    logWarn('Invio email supporto non riuscito', { reason: error?.reason || 'unknown' });
    return res.status(502).json({ error: 'Non siamo riusciti a inviare la richiesta. Riprova.' });
  }
};

module.exports = { sendSupport };
