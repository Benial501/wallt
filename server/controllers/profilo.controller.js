const logger = require('../utils/logger');
const { ProfiloUtente, OnboardingSession } = require('../models');
const { skipOnboarding, repairUserProfilo } = require('../services/onboarding.service');
const { isOnboardingComplete } = require('../utils/onboarding');
const {
  isMinorProfilo,
  sanitizeProfiloDataForMinor,
  VALID_FASCE_ETA,
} = require('../utils/ageRestriction');
const { syncUserFeatureFlagsFromProfilo } = require('../utils/featureAccess');

const ALLOWED_FIELDS = [
  'fascia_eta', 'situazione_lavorativa', 'entrata_fissa', 'entrata_mensile', 'mesi_riserva_piano_smart',
  'orizzonte_tipo', 'orizzonte_data',
  'situazione_abitativa', 'costo_abitazione', 'paga_bollette', 'stima_bollette',
  'ha_auto', 'ha_moto', 'usa_mezzi_pubblici', 'spesa_benzina', 'spesa_mezzi',
  'spese_fisse_extra', 'risparmia', 'ha_investimenti', 'fa_scommesse',
  'onboarding_completato',
];

const getProfilo = async (req, res) => {
  try {
    const profilo = await repairUserProfilo(req.userId);

    if (!profilo) {
      return res.status(404).json({ message: 'Profilo non trovato' });
    }

    res.json({
      profilo: {
        ...profilo.toJSON(),
        onboarding_completato: isOnboardingComplete(profilo),
      },
    });
  } catch (error) {
    logger.error('Errore getProfilo', { err: error });
    res.status(500).json({ message: 'Errore durante il recupero del profilo' });
  }
};

const updateProfilo = async (req, res) => {
  try {
    let updateData = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.onboarding_completato !== undefined) {
      updateData.onboarding_completato = !!req.body.onboarding_completato;
    }

    if (updateData.onboarding_completato && await OnboardingSession.count({ where: { user_id: req.userId, status: 'draft' } })) {
      return res.status(409).json({ message: 'Completa la configurazione guidata prima di entrare nell’app' });
    }

    if (updateData.fascia_eta && !VALID_FASCE_ETA.includes(updateData.fascia_eta)) {
      return res.status(400).json({ message: 'Fascia d\'età non valida' });
    }

    const existingProfilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    const fasciaFinale = updateData.fascia_eta ?? existingProfilo?.fascia_eta;

    if (updateData.onboarding_completato && !fasciaFinale) {
      return res.status(400).json({ message: 'La fascia d\'età è obbligatoria per completare il questionario' });
    }

    updateData = sanitizeProfiloDataForMinor({
      ...updateData,
      fascia_eta: updateData.fascia_eta ?? fasciaFinale,
    });

    const [profilo] = await ProfiloUtente.findOrCreate({
      where: { user_id: req.userId },
      defaults: {
        user_id: req.userId,
        onboarding_completato: false,
        ...updateData,
      },
    });

    if (Object.keys(updateData).length > 0) {
      await profilo.update(updateData);
      await profilo.reload();
    }

    const enableOnCompletion = req.body.onboarding_completato === true;
    const preferenze = await syncUserFeatureFlagsFromProfilo(req.userId, profilo, { enableOnCompletion });

    const profiloResponse = {
      ...profilo.toJSON(),
      onboarding_completato: isOnboardingComplete(profilo),
    };

    res.json({
      message: 'Profilo aggiornato',
      profilo: profiloResponse,
      preferenze,
    });
  } catch (error) {
    logger.error('Errore updateProfilo', { err: error });
    res.status(500).json({ message: 'Errore durante l\'aggiornamento del profilo' });
  }
};

const skipOnboardingHandler = async (req, res) => {
  try {
    if (await OnboardingSession.count({ where: { user_id: req.userId, status: 'draft' } })) {
      return res.status(409).json({ message: 'Puoi saltare le sezioni facoltative nella configurazione guidata' });
    }
    const existingProfilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    if (!existingProfilo?.fascia_eta) {
      return res.status(400).json({ message: 'La fascia d\'età è obbligatoria per continuare' });
    }

    const profilo = await skipOnboarding(req.userId);
    const preferenze = await syncUserFeatureFlagsFromProfilo(req.userId, profilo);

    res.json({
      message: 'Onboarding saltato',
      profilo: {
        ...profilo.toJSON(),
        onboarding_completato: true,
      },
      preferenze,
    });
  } catch (error) {
    logger.error('Errore skipOnboarding', { err: error });
    res.status(500).json({ message: 'Errore durante il salto onboarding' });
  }
};

module.exports = { getProfilo, updateProfilo, skipOnboardingHandler };
