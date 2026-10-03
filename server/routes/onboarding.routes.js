const router = require('express').Router();
const { sequelize, OnboardingSession } = require('../models');
const authMiddleware = require('../middleware/auth.middleware');
const { finalizeOnboarding } = require('../services/onboardingFinalization.service');
const { previewImport, confirmImport, listImports } = require('../services/onboardingImport.service');
const { uploadFileMiddleware, validateUploadedFile } = require('../controllers/importazioni.controller');
const { importUploadLimiter, importConfirmLimiter } = require('../middleware/rateLimit.middleware');

const STEPS = new Set(['utilizzi', 'categorie', 'entrate', 'spese', 'abbonamenti', 'impegni', 'conti', 'import', 'obiettivi', 'preferenze', 'riepilogo']);
const ANSWER_KEYS = new Set(['utilizzi', 'fascia_eta', 'categorie', 'entrate', 'spese', 'abbonamenti', 'impegni', 'conti', 'obiettivi', 'preferenze', 'sezioni_completate']);

const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
const serialize = session => ({
  id: session.id,
  schema_version: session.schema_version,
  current_step: session.current_step,
  status: session.status,
  answers: session.answers,
  revision: session.revision,
  last_saved_at: session.last_saved_at,
  completed_at: session.completed_at,
});

router.use(authMiddleware);

router.get('/imports', async (req, res, next) => {
  try { return res.json({ imports: await listImports(req.userId) }); } catch (error) { return next(error); }
});

router.post('/imports', importUploadLimiter, uploadFileMiddleware, validateUploadedFile, async (req, res, next) => {
  try { return res.json(await previewImport(req.userId, req.body.account_key, req.file)); } catch (error) { return next(error); }
});

router.put('/imports/:id', importConfirmLimiter, async (req, res, next) => {
  try { return res.json(await confirmImport(req.userId, req.params.id, req.body?.rows)); } catch (error) { return next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const session = await OnboardingSession.findOne({ where: { user_id: req.userId } });
    if (!session) return res.status(404).json({ message: 'Configurazione guidata non disponibile per questo account' });
    return res.json({ session: serialize(session) });
  } catch (error) { return next(error); }
});

router.put('/', async (req, res, next) => {
  try {
    if (!STEPS.has(req.body?.current_step)) throw invalid('Fase di configurazione non valida');
    const patch = req.body?.answers;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw invalid('Dati di configurazione non validi');
    if (Object.keys(patch).some(key => !ANSWER_KEYS.has(key))) throw invalid('La configurazione contiene campi non previsti');
    if (JSON.stringify(patch).length > 100000) throw invalid('Questa sezione contiene troppi dati');
    const session = await sequelize.transaction(async transaction => {
      const row = await OnboardingSession.findOne({ where: { user_id: req.userId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row) throw Object.assign(new Error('Configurazione guidata non disponibile'), { statusCode: 404 });
      if (row.status === 'completed') throw Object.assign(new Error('Configurazione già completata'), { statusCode: 409 });
      if (req.body.revision !== undefined && req.body.revision !== row.revision) throw Object.assign(new Error('La configurazione è stata aggiornata altrove. Ricarica prima di salvare.'), { statusCode: 409 });
      await row.update({
        current_step: req.body.current_step,
        answers: { ...row.answers, ...patch },
        revision: row.revision + 1,
        last_saved_at: new Date(),
      }, { transaction });
      return row;
    });
    return res.json({ session: serialize(session) });
  } catch (error) { return next(error); }
});

router.post('/finalize', async (req, res, next) => {
  try { return res.json(await finalizeOnboarding(req.userId)); } catch (error) { return next(error); }
});

module.exports = router;
