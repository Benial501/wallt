const FileFormatDetector = require('../detectors/FileFormatDetector');
const BankFormatDetector = require('../detectors/BankFormatDetector');

const TransactionNormalizer = require('./TransactionNormalizer');
const DuplicateChecker = require('./DuplicateChecker');
const CategoryMatcher = require('./CategoryMatcher');

const GenericCSVParser = require('../parsers/GenericCSVParser');
const ExcelParser = require('../parsers/ExcelParser');

const OldImportService = require('../../import/ImportService');

class ImportService {
  constructor({
    fileFormatDetector = new FileFormatDetector(),
    bankFormatDetector = new BankFormatDetector(),
    transactionNormalizer = new TransactionNormalizer(),
    duplicateChecker = new DuplicateChecker(),
    categoryMatcher = new CategoryMatcher(),
  } = {}) {
    this.fileFormatDetector = fileFormatDetector;
    this.bankFormatDetector = bankFormatDetector;
    this.transactionNormalizer = transactionNormalizer;
    this.duplicateChecker = duplicateChecker;
    this.categoryMatcher = categoryMatcher;

    // Usiamo il confirmImport già presente nel progetto.
    this.oldImportService = new OldImportService({
      transactionNormalizer: this.transactionNormalizer,
      duplicateChecker: this.duplicateChecker,
      categoryMatcher: this.categoryMatcher,
    });
  }

  async previewImport({ userId, buffer, fileName }) {
    const fileFormat = this.fileFormatDetector.detect({ fileName, buffer });
    if (!['csv', 'excel'].includes(fileFormat)) {
      throw Object.assign(
        new Error('Formato file non supportato. Usa .csv o .xls/.xlsx'),
        { statusCode: 400 },
      );
    }

    const bankId = fileFormat === 'csv'
      ? this.bankFormatDetector.detect({ fileFormat, buffer })
      : 'generic';

    // eslint-disable-next-line global-require
    const RevolutCSVParser = require('../parsers/RevolutCSVParser');
    let rawTransactions = [];

    if (fileFormat === 'csv') {
      const useRevolut = RevolutCSVParser.isRevolutCsv(buffer) || bankId === 'revolut';
      if (useRevolut) {
        try {
          rawTransactions = await new RevolutCSVParser().parse(buffer);
        } catch {
          rawTransactions = [];
        }
      }
      if (!rawTransactions.length) {
        rawTransactions = await new GenericCSVParser().parse(buffer);
      }
    } else {
      if (RevolutCSVParser.isRevolutCsv(buffer)) {
        rawTransactions = await new RevolutCSVParser().parse(buffer);
      }
      if (!rawTransactions.length) {
        rawTransactions = await new ExcelParser().parse(buffer);
      }
    }

    if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
      throw Object.assign(new Error('Nessuna transazione trovata nel file'), { statusCode: 400 });
    }

    return this.oldImportService.previewImport(userId, rawTransactions);
  }

  async confirmImport({ userId, transactionsToImport, aggiornaSaldo = false }) {
    return this.oldImportService.confirmImport(userId, transactionsToImport, { aggiornaSaldo });
  }
}

module.exports = ImportService;

