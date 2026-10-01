const logger = require('../utils/logger');
const { User } = require('../models');
const { RUOLO_ADMIN } = require('../constants/entitlements');

/**
 * Accesso riservato agli amministratori.
 *
 * Il ruolo si legge dal database a ogni richiesta, non dal JWT.
 *
 * Non è pignoleria: se il ruolo stesse nel token, revocare un amministratore
 * non avrebbe effetto fino alla scadenza del suo token (7 giorni in WALLT), e
 * chiunque riuscisse a farsi emettere un token con un claim in più
 * diventerebbe amministratore. Una lettura in più per richiesta su una pagina
 * che visitano una o due persone è un costo irrilevante.
 *
 * Non è nemmeno un confronto di email: `email === 'io@...'` nel frontend è
 * aggirabile in un secondo, e nel backend lega il privilegio a un dato che
 * l'utente stesso può cambiare dalle impostazioni. Il ruolo è una colonna che
 * nessuna rotta applicativa scrive — si concede con
 * `server/scripts/concedi-ruolo-admin.js`, che richiede l'accesso al database.
 *
 * Risponde 404 e non 403 a chi non è amministratore: l'esistenza dell'area di
 * amministrazione non è un'informazione che serva a un utente normale.
 * `authMiddleware` ha già verificato l'autenticazione, quindi qui la domanda
 * è soltanto sul ruolo.
 */
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId, { attributes: ['id', 'ruolo'] });

    if (!user) return res.status(401).json({ message: 'Utente non trovato' });

    if (user.ruolo !== RUOLO_ADMIN) {
      logger.warn('Accesso ad area amministrativa negato', { user_id: req.userId });
      return res.status(404).json({ message: 'Risorsa non trovata' });
    }

    req.isAdmin = true;
    return next();
  } catch (error) {
    logger.error('Errore verifica ruolo amministratore', { err: error });
    return res.status(500).json({ message: 'Errore nella verifica dei permessi' });
  }
};

module.exports = { requireAdmin };
