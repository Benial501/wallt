const logger = require('../utils/logger');
const { ProfiloUtente } = require('../models');
const { skipOnboarding, repairUserProfilo } = require('../services/onboarding.service');
const { isOnboardingComplete } = require('../utils/onboarding');
const {
  isMinorProfilo,
  sanitizeProfiloDataForMinor,
  VALID_FASCE_ETA,
} = require('../utils/ageRestriction');
const { syncUserFeatureFlagsFromProfilo } = require('../utils/featureAccess');

const DISTRIBUZIONI = {
  GENITORI: {
    cibo: 20, svago: 20, abbigliamento: 10, risparmio: 35, investimento: 10, acquisti: 5,
  },
  AFFITTO_MUTUO: {
    cibo: 25, svago: 12, abbigliamento: 8, risparmio: 20, investimento: 8, salute: 5, acquisti: 7,
  },
  STUDENTE: {
    cibo: 30, svago: 25, abbigliamento: 15, risparmio: 20, acquisti: 10,
  },
  AUTONOMO: {
    cibo: 20, svago: 10, risparmio: 25, investimento: 10, salute: 5, acquisti: 30,
  },
};

const CATEGORIA_INFO = {
  cibo: { nome: 'Cibo', emoji: '🍕' },
  svago: { nome: 'Svago', emoji: '🎉' },
  abbigliamento: { nome: 'Abbigliamento', emoji: '👕' },
  risparmio: { nome: 'Risparmio', emoji: '💰' },
  investimento: { nome: 'Investimenti', emoji: '📈' },
  acquisti: { nome: 'Acquisti', emoji: '🛍️' },
  salute: { nome: 'Salute', emoji: '🏥' },
  scommesse: { nome: 'Scommesse', emoji: '🎰' },
};

const toNumber = (val) => parseFloat(val) || 0;

const getProfiloBudgetType = (profilo) => {
  if (profilo.situazione_abitativa === 'vivo_con_genitori') return 'GENITORI';
  if (['affitto', 'proprieta_mutuo'].includes(profilo.situazione_abitativa)) return 'AFFITTO_MUTUO';
  if (['studente', 'studente_lavoratore'].includes(profilo.situazione_lavorativa)) return 'STUDENTE';
  if (profilo.situazione_lavorativa === 'autonomo') return 'AUTONOMO';
  return 'AFFITTO_MUTUO';
};

const calcolaSpeseFisse = (profilo) => {
  let speseFisse = 0;

  if (['affitto', 'proprieta_mutuo'].includes(profilo.situazione_abitativa)) {
    speseFisse += toNumber(profilo.costo_abitazione);
  }

  if (profilo.paga_bollette === 'tutte') {
    speseFisse += toNumber(profilo.stima_bollette);
  } else if (profilo.paga_bollette === 'divise') {
    speseFisse += toNumber(profilo.stima_bollette) / 2;
  }

  if (profilo.ha_auto || profilo.ha_moto) {
    speseFisse += toNumber(profilo.spesa_benzina);
  }

  if (profilo.usa_mezzi_pubblici) {
    speseFisse += toNumber(profilo.spesa_mezzi);
  }

  speseFisse += toNumber(profilo.spese_fisse_extra);

  return Math.round(speseFisse * 100) / 100;
};

const calcolaBudgetSuggerito = (profilo) => {
  const entrataMensile = toNumber(profilo.entrata_mensile);
  const speseFisse = calcolaSpeseFisse(profilo);
  const disponibile = Math.max(0, Math.round((entrataMensile - speseFisse) * 100) / 100);

  const tipoProfilo = getProfiloBudgetType(profilo);
  const distribuzione = { ...DISTRIBUZIONI[tipoProfilo] };

  const haScommesse = profilo.fa_scommesse && profilo.fa_scommesse !== 'no';
  let budgetDisponibile = disponibile;
  let importoScommesse = 0;

  if (haScommesse && entrataMensile > 0) {
    importoScommesse = Math.round(entrataMensile * 0.05 * 100) / 100;
    budgetDisponibile = Math.max(0, disponibile - importoScommesse);
  }

  const totalePercentuali = Object.values(distribuzione).reduce((a, b) => a + b, 0);

  const categorie = Object.entries(distribuzione).map(([key, pct]) => {
    const importo = Math.round((budgetDisponibile * (pct / totalePercentuali)) * 100) / 100;
    const percentuale = entrataMensile > 0
      ? Math.round((importo / entrataMensile) * 10000) / 100
      : 0;

    return {
      id: key,
      categoria: key,
      nome: CATEGORIA_INFO[key]?.nome || key,
      emoji: CATEGORIA_INFO[key]?.emoji || '📊',
      percentuale_distribuzione: pct,
      percentuale,
      importo,
    };
  });

  if (haScommesse && entrataMensile > 0) {
    categorie.push({
      id: 'scommesse',
      categoria: 'scommesse',
      nome: CATEGORIA_INFO.scommesse.nome,
      emoji: CATEGORIA_INFO.scommesse.emoji,
      percentuale_distribuzione: 5,
      percentuale: 5,
      importo: importoScommesse,
    });
  }

  return {
    importo_totale: entrataMensile,
    spese_fisse: speseFisse,
    disponibile,
    tipo_profilo: tipoProfilo,
    categorie,
  };
};

const ALLOWED_FIELDS = [
  'fascia_eta', 'situazione_lavorativa', 'entrata_fissa', 'entrata_mensile',
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

const getBudgetSuggerito = async (req, res) => {
  try {
    const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });

    if (!profilo) {
      return res.status(404).json({ message: 'Profilo non trovato' });
    }

    if (!profilo.entrata_mensile) {
      return res.status(400).json({ message: 'Entrata mensile non configurata nel profilo' });
    }

    const budgetSuggerito = calcolaBudgetSuggerito(profilo);
    res.json(budgetSuggerito);
  } catch (error) {
    logger.error('Errore getBudgetSuggerito', { err: error });
    res.status(500).json({ message: 'Errore durante il calcolo del budget suggerito' });
  }
};

module.exports = { getProfilo, updateProfilo, skipOnboardingHandler, getBudgetSuggerito, calcolaBudgetSuggerito };
