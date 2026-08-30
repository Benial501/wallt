const { User } = require('../models');

const MINOR_ETA_FASCIA = 'under_18';

const VALID_FASCE_ETA = [
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
];

const isMinorProfilo = (profilo) => {
  if (!profilo) return false;
  const fascia = profilo.fascia_eta ?? profilo.get?.('fascia_eta');
  return fascia === MINOR_ETA_FASCIA;
};

const sanitizeProfiloDataForMinor = (data) => {
  if (data.fascia_eta !== MINOR_ETA_FASCIA) return data;
  return {
    ...data,
    ha_investimenti: 'no',
    fa_scommesse: 'no',
  };
};

const applyMinorUserRestrictions = async (userId, transaction = null) => {
  await User.update(
    { mostra_scommesse: false, mostra_investimenti: false },
    { where: { id: userId }, transaction },
  );
};

const maskUserFeaturesForMinor = (userJson, profilo) => {
  if (!isMinorProfilo(profilo ?? userJson?.profilo)) return userJson;
  return {
    ...userJson,
    mostra_scommesse: false,
    mostra_investimenti: false,
  };
};

module.exports = {
  MINOR_ETA_FASCIA,
  VALID_FASCE_ETA,
  isMinorProfilo,
  sanitizeProfiloDataForMinor,
  applyMinorUserRestrictions,
  maskUserFeaturesForMinor,
};
