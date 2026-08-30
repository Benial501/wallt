const { User, ProfiloUtente } = require('../models');
const { isMinorProfilo } = require('../utils/ageRestriction');
const {
  canShowScommesse,
  canShowInvestimenti,
  wantsScommesse,
  wantsInvestimenti,
} = require('../utils/featureAccess');

const featureDeniedMessage = (feature, profilo) => {
  if (isMinorProfilo(profilo)) {
    return 'Scommesse e investimenti non sono disponibili per utenti under 18.';
  }
  if (feature === 'scommesse' && !wantsScommesse(profilo)) {
    return 'La sezione Scommesse non è disponibile in base al tuo profilo.';
  }
  if (feature === 'investimenti' && !wantsInvestimenti(profilo)) {
    return 'La sezione Investimenti non è disponibile in base al tuo profilo.';
  }
  return 'Funzione non disponibile per il tuo profilo.';
};

const blockScommesseAccess = async (req, res, next) => {
  try {
    const [profilo, user] = await Promise.all([
      ProfiloUtente.findOne({ where: { user_id: req.userId } }),
      User.findByPk(req.userId, { attributes: ['mostra_scommesse', 'mostra_investimenti'] }),
    ]);

    if (!canShowScommesse(user, profilo)) {
      return res.status(403).json({
        error: 'Funzione non disponibile',
        message: featureDeniedMessage('scommesse', profilo),
      });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Errore verifica accesso funzionalità' });
  }
};

const blockInvestimentiAccess = async (req, res, next) => {
  try {
    const [profilo, user] = await Promise.all([
      ProfiloUtente.findOne({ where: { user_id: req.userId } }),
      User.findByPk(req.userId, { attributes: ['mostra_scommesse', 'mostra_investimenti'] }),
    ]);

    if (!canShowInvestimenti(user, profilo)) {
      return res.status(403).json({
        error: 'Funzione non disponibile',
        message: featureDeniedMessage('investimenti', profilo),
      });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Errore verifica accesso funzionalità' });
  }
};

module.exports = {
  blockScommesseAccess,
  blockInvestimentiAccess,
};
