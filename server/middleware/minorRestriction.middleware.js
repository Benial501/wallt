const { ProfiloUtente } = require('../models');
const { isMinorProfilo } = require('../utils/ageRestriction');

const blockMinorRestrictedFeatures = async (req, res, next) => {
  try {
    const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    if (isMinorProfilo(profilo)) {
      return res.status(403).json({
        error: 'Funzione non disponibile',
        message: 'Scommesse e investimenti non sono disponibili per utenti under 18.',
      });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Errore verifica età' });
  }
};

module.exports = { blockMinorRestrictedFeatures };
