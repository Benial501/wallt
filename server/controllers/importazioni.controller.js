const multer = require('multer');
const path = require('path');
const { BadRequestError } = require('../utils/AppError');
const { validateImportFileBuffer } = require('../utils/fileMagicBytes');
const ImportService = require('../services/importazioni/services/ImportService');
const { valutaBudgetDopoMovimento } = require('../services/notifiche/NotificheGenerator');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const isAllowedExtension = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  return ['.csv', '.xls', '.xlsx'].includes(ext);
};

const fileFilter = (_req, file, cb) => {
  if (!file.originalname || !isAllowedExtension(file.originalname)) {
    return cb(new BadRequestError('Formato file non supportato. Usa .csv o .xls/.xlsx'));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

const validateUploadedFile = (req, _res, next) => {
  try {
    if (!req.file) {
      throw new BadRequestError('Nessun file caricato');
    }
    validateImportFileBuffer(req.file.buffer, req.file.originalname);
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/importazioni/upload
 * - accetta CSV/XLS/XLSX in multipart/form-data (field: `file`)
 * - risponde con anteprima (duplicates + categorie suggerite)
 */
const uploadPreview = async (req, res, next) => {
  try {
    const importService = new ImportService();
    const preview = await importService.previewImport({
      userId: req.userId,
      buffer: req.file.buffer,
      fileName: req.file.originalname,
    });
    return res.json(preview);
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/importazioni/conferma
 * - body: { transactions: [{ data, descrizione, importo, tipo, conto_id, categoria_finale, clientTxId }] }
 */
const conferma = async (req, res, next) => {
  try {
    const { transactions, aggiorna_saldo: aggiornaSaldo = false } = req.body || {};
    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: 'Payload non valido: atteso transactions[]' });
    }

    const importService = new ImportService();
    const result = await importService.confirmImport({
      userId: req.userId,
      transactionsToImport: transactions,
      aggiornaSaldo: !!aggiornaSaldo,
    });

    // Un import può sfondare più budget in un colpo solo: le soglie vanno
    // rivalutate subito, non al cron del giorno dopo.
    await valutaBudgetDopoMovimento(req.userId);

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  uploadFileMiddleware: upload.single('file'),
  validateUploadedFile,
  uploadPreview,
  conferma,
};
