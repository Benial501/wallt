const path = require('path');

const FileFormatDetector = require('../detectors/FileFormatDetector');
const BankFormatDetector = require('../detectors/BankFormatDetector');

const TransactionNormalizer = require('./TransactionNormalizer');
const DuplicateChecker = require('./DuplicateChecker');
const CategoryMatcher = require('./CategoryMatcher');

const GenericCSVParser = require('../parsers/GenericCSVParser');
const ExcelParser = require('../parsers/ExcelParser');
const PDFParser = require('../parsers/PDFParser');

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
    if (!['csv', 'excel', 'pdf', 'unknown'].includes(fileFormat)) {
      throw Object.assign(new Error('Formato file non supportato'), { statusCode: 400 });
    }

    // Bank detection per CSV e PDF.
    let bankInfo = { bankId: 'generic', text: '' };
    if (fileFormat === 'pdf') {
      bankInfo = await this.bankFormatDetector.detect({ fileFormat, buffer });
    } else if (fileFormat === 'csv') {
      const bankId = await this.bankFormatDetector.detect({ fileFormat, buffer });
      bankInfo = { bankId: typeof bankId === 'string' ? bankId : 'generic', text: '' };
    }

    let parser;
    let rawTransactions = [];

    if (fileFormat === 'csv') {
      const RevolutCSVParser = require('../parsers/RevolutCSVParser');
      const useRevolut = RevolutCSVParser.isRevolutCsv(buffer) || bankInfo.bankId === 'revolut';
      if (useRevolut) {
        try {
          parser = new RevolutCSVParser();
          rawTransactions = await parser.parse(buffer);
        } catch (parseError) {
          parser = new GenericCSVParser();
          rawTransactions = await parser.parse(buffer);
        }
        if (!rawTransactions.length) {
          parser = new GenericCSVParser();
          rawTransactions = await parser.parse(buffer);
        }
      } else {
        parser = new GenericCSVParser();
        rawTransactions = await parser.parse(buffer);
      }
    } else if (fileFormat === 'excel') {
      const RevolutCSVParser = require('../parsers/RevolutCSVParser');
      if (RevolutCSVParser.isRevolutCsv(buffer)) {
        parser = new RevolutCSVParser();
        rawTransactions = await parser.parse(buffer);
      }
      if (!rawTransactions.length) {
        parser = new ExcelParser();
        rawTransactions = await parser.parse(buffer);
      }
    } else if (fileFormat === 'pdf') {
      const bankId = bankInfo.bankId || 'generic';
      const parserPath = path.join(__dirname, '../parsers');

      let ParserImpl = null;
      if (bankId && bankId !== 'generic') {
        const className = `${bankId.charAt(0).toUpperCase()}${bankId.slice(1)}Parser`;
        try {
          ParserImpl = require(path.join(parserPath, `${className}.js`));
        } catch {
          ParserImpl = null;
        }
      }

      if (!ParserImpl) {
        ParserImpl = class GenericPDFParser {
          constructor() {
            this.parser = new PDFParser({ bankId: 'generic' });
          }

          async parse(buf, opts) {
            return this.parser.parse(buf, opts);
          }
        };
      }

      const parserInstance = new ParserImpl();
      rawTransactions = await parserInstance.parse(buffer, { text: bankInfo.text });
    } else {
      throw Object.assign(new Error('Formato file non supportato'), { statusCode: 400 });
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

