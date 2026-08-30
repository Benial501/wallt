const { User } = require('../models');
const { isMinorProfilo } = require('./ageRestriction');

const wantsScommesse = (profilo) => {
  if (!profilo) return false;
  const val = profilo.fa_scommesse ?? profilo.get?.('fa_scommesse');
  return !!val && val !== 'no';
};

const wantsInvestimenti = (profilo) => {
  if (!profilo) return false;
  const val = profilo.ha_investimenti ?? profilo.get?.('ha_investimenti');
  return !!val && val !== 'no';
};

const toBool = (value, defaultValue = true) => {
  if (value === false || value === 0 || value === '0') return false;
  if (value === true || value === 1 || value === '1') return true;
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value);
};

const canShowScommesse = (user, profilo = null) => {
  const p = profilo ?? user?.profilo;
  if (isMinorProfilo(p)) return false;
  if (!wantsScommesse(p)) return false;
  return toBool(user?.mostra_scommesse, true);
};

const canShowInvestimenti = (user, profilo = null) => {
  const p = profilo ?? user?.profilo;
  if (isMinorProfilo(p)) return false;
  if (!wantsInvestimenti(p)) return false;
  return toBool(user?.mostra_investimenti, true);
};

const syncUserFeatureFlagsFromProfilo = async (userId, profilo, options = {}, transaction = null) => {
  const { enableOnCompletion = false } = options;
  const updates = {};

  if (isMinorProfilo(profilo) || !wantsScommesse(profilo)) {
    updates.mostra_scommesse = false;
  } else if (enableOnCompletion) {
    updates.mostra_scommesse = true;
  }

  if (isMinorProfilo(profilo) || !wantsInvestimenti(profilo)) {
    updates.mostra_investimenti = false;
  } else if (enableOnCompletion) {
    updates.mostra_investimenti = true;
  }

  if (Object.keys(updates).length > 0) {
    await User.update(updates, { where: { id: userId }, transaction });
  }

  const user = await User.findByPk(userId, { transaction });
  const userJson = user?.toJSON?.() ?? user ?? {};

  return {
    mostra_scommesse: canShowScommesse(userJson, profilo),
    mostra_investimenti: canShowInvestimenti(userJson, profilo),
  };
};

const maskUserFeatureFlags = (userJson, profilo = null) => {
  const p = profilo ?? userJson?.profilo;
  return {
    ...userJson,
    mostra_scommesse: canShowScommesse(userJson, p),
    mostra_investimenti: canShowInvestimenti(userJson, p),
  };
};

module.exports = {
  wantsScommesse,
  wantsInvestimenti,
  canShowScommesse,
  canShowInvestimenti,
  syncUserFeatureFlagsFromProfilo,
  maskUserFeatureFlags,
};
