const { User, ProfiloUtente } = require('../models');
const { isOnboardingComplete } = require('../utils/onboarding');
const { isMinorProfilo } = require('../utils/ageRestriction');

/** Minuti dopo la registrazione in cui mostrare ancora il questionario */
const NEW_ACCOUNT_GRACE_MINUTES = 15;

const isFreshRegistration = (user) => {
  if (!user?.createdAt) return false;
  const ageMinutes = (Date.now() - new Date(user.createdAt).getTime()) / 60000;
  return ageMinutes < NEW_ACCOUNT_GRACE_MINUTES;
};

/**
 * Allinea il profilo al tipo di accesso:
 * - registrazione recente (< 15 min) → questionario se non completato
 * - account esistente → onboarding considerato completato
 */
const ensureProfiloOnAuth = async (userId, { isNewRegistration = false } = {}) => {
  const [profilo] = await ProfiloUtente.findOrCreate({
    where: { user_id: userId },
    defaults: {
      onboarding_completato: isNewRegistration ? false : true,
    },
  });

  if (!isNewRegistration && !isOnboardingComplete(profilo)) {
    await profilo.update({ onboarding_completato: true });
    await profilo.reload();
  }

  return profilo;
};

/**
 * Ripara profilo mancante o incoerente (es. account Google senza riga profilo).
 * Chiamato su /auth/me e login OAuth.
 */
const repairUserProfilo = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) return null;

  const isNewRegistration = isFreshRegistration(user);
  return ensureProfiloOnAuth(userId, { isNewRegistration });
};

const skipOnboarding = async (userId) => {
  const [profilo] = await ProfiloUtente.findOrCreate({
    where: { user_id: userId },
    defaults: { onboarding_completato: true },
  });

  const updates = { onboarding_completato: true };
  if (isMinorProfilo(profilo)) {
    updates.ha_investimenti = 'no';
    updates.fa_scommesse = 'no';
  }

  if (!isOnboardingComplete(profilo) || isMinorProfilo(profilo)) {
    await profilo.update(updates);
    await profilo.reload();
  }

  return profilo;
};

const QUESTIONNAIRE_FIELDS = [
  'fascia_eta', 'situazione_lavorativa', 'entrata_fissa', 'entrata_mensile',
  'situazione_abitativa', 'costo_abitazione', 'paga_bollette', 'stima_bollette',
  'ha_auto', 'ha_moto', 'usa_mezzi_pubblici', 'spesa_benzina', 'spesa_mezzi',
  'spese_fisse_extra', 'risparmia', 'ha_investimenti', 'fa_scommesse',
  'onboarding_completato',
];

const snapshotProfilo = (profilo) => {
  if (!profilo) return null;
  const json = profilo.toJSON ? profilo.toJSON() : { ...profilo };
  const snapshot = {};
  for (const field of QUESTIONNAIRE_FIELDS) {
    if (json[field] !== undefined) snapshot[field] = json[field];
  }
  return snapshot;
};

/**
 * Dopo reset dati finanziari: conserva questionario e flag onboarding.
 * Chi resetta ha già usato l'app → onboarding sempre completato.
 */
const preserveOnboardingAfterReset = async (userId, profiloBefore = null) => {
  const snapshot = snapshotProfilo(profiloBefore);
  let profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });

  const baseData = {
    ...(snapshot || {}),
    onboarding_completato: true,
  };

  if (!profilo) {
    return ProfiloUtente.create({ user_id: userId, ...baseData });
  }

  const restoreData = { onboarding_completato: true };
  if (snapshot) {
    for (const field of QUESTIONNAIRE_FIELDS) {
      if (field === 'onboarding_completato') continue;
      if (snapshot[field] != null && (profilo[field] == null || profilo[field] === '')) {
        restoreData[field] = snapshot[field];
      }
    }
  }

  await profilo.update(restoreData);
  await profilo.reload();
  return profilo;
};

module.exports = {
  ensureProfiloOnAuth,
  repairUserProfilo,
  skipOnboarding,
  preserveOnboardingAfterReset,
  isFreshRegistration,
};
