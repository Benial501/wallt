const logger = require('../../utils/logger');
const { Op } = require('sequelize');
const { sequelize, Conto, Movimento } = require('../../models');
const CSVParserService = require('./CSVParserService');
const ExcelParserService = require('./ExcelParserService');
const TransactionNormalizer = require('./TransactionNormalizer');
const DuplicateChecker = require('./DuplicateChecker');
const CategoryMatcher = require('./CategoryMatcher');
const CategoryMatcherService = require('./CategoryMatcherService');
const CategoryLearningService = require('./CategoryLearningService');
const { MerchantAnalyzer, PersonalMerchantRulesService } = require('../merchant');

const toNumber = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Responsabilità: orchestrare il flusso di preview e conferma.
 * Nota architetturale: la scelta del parser (CSV vs Open Banking) dovrebbe avvenire in controller.
 * Qui lavoriamo su rawTransactions -> normalizzazione -> duplicate/category -> import.
 */
class ImportService {
  constructor({
    transactionNormalizer = new TransactionNormalizer(),
    duplicateChecker = new DuplicateChecker(),
    categoryMatcher = new CategoryMatcherService(),
    learningService = new CategoryLearningService(),
    merchantAnalyzer = new MerchantAnalyzer(),
    personalRulesService = new PersonalMerchantRulesService(),
  } = {}) {
    this.transactionNormalizer = transactionNormalizer;
    this.duplicateChecker = duplicateChecker;
    this.categoryMatcher = categoryMatcher;
    this.learningService = learningService;
    this.merchantAnalyzer = merchantAnalyzer;
    this.personalRulesService = personalRulesService;

    // Istanziazione “soft” dei parser per comodo (utile se controller/route riusa ImportService).
    this.csvParser = new CSVParserService();
    this.excelParser = new ExcelParserService();
  }

  async previewImport(userId, rawTransactions) {
    const { normalizedTransactions, warnings } = await this.transactionNormalizer.normalize({
      userId,
      rawTransactions,
    });

    const merchantResults = this.merchantAnalyzer
      ? await this.merchantAnalyzer.analyzeBatch(normalizedTransactions, userId)
      : [];
    const merchantMap = new Map(merchantResults.map((m) => [m.clientTxId, m]));

    const withDuplicates = await this.duplicateChecker.check(userId, normalizedTransactions);

    const toClassify = withDuplicates.filter((tx) => !tx.isDuplicate);
    const matchResults = await this.categoryMatcher.matchBatch({
      userId,
      transactions: toClassify,
    });
    const matchMap = new Map(matchResults.map((m) => [m.clientTxId, m]));

    const items = withDuplicates.map((tx) => {
      if (tx.isDuplicate) {
        return {
          clientTxId: tx.clientTxId,
          data: tx.data,
          descrizione: tx.descrizione,
          importo: tx.importo,
          tipo: tx.tipo,
          conto_id: tx.conto_id,
          conto_nome: tx.conto_nome,
          merchant: null,
          merchant_id: null,
          merchant_confidenza: null,
          descrizione_pulita: null,
          categoria_suggerita: null,
          categoria_confidenza: null,
          categoria_automatica: false,
          categoria_fonte: null,
          isDuplicate: true,
        };
      }

      const merchant = merchantMap.get(tx.clientTxId) || {};
      const match = matchMap.get(tx.clientTxId) || {};

      let categoriaSuggerita = match.categoria ?? (tx.tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita');
      let categoriaConfidenza = match.confidenza ?? 30;
      let categoriaFonte = match.source ?? 'ai_default';

      // Merchant Intelligence: non sovrascrivere match affidabili.
      const matchConf = match.confidenza ?? 0;
      if (merchant.source === 'unverified') {
        if (matchConf < 55) {
          categoriaSuggerita = merchant.categoria ?? 'da_verificare';
          categoriaConfidenza = 0;
          categoriaFonte = 'unverified';
        }
      } else if (merchant.source?.startsWith('ai_') && merchant.categoria && (merchant.confidenza ?? 0) > matchConf) {
        categoriaSuggerita = merchant.categoria;
        categoriaConfidenza = merchant.confidenza ?? 50;
        categoriaFonte = merchant.source;
      } else if (merchant.source?.startsWith('lookup_') && merchant.categoria && (merchant.confidenza ?? 0) > matchConf) {
        categoriaSuggerita = merchant.categoria;
        categoriaConfidenza = merchant.confidenza ?? 70;
        categoriaFonte = merchant.source;
      } else if (
        merchant.merchant
        && merchant.categoria
        && (merchant.confidenza ?? 0) >= 65
        && (merchant.source === 'user' || (merchant.confidenza ?? 0) > matchConf + 5)
      ) {
        categoriaSuggerita = merchant.categoria;
        categoriaConfidenza = merchant.confidenza;
        categoriaFonte = merchant.source === 'user' ? 'user' : 'merchant';
      } else if (merchant.source === 'user' && merchant.categoria) {
        categoriaSuggerita = merchant.categoria;
        categoriaConfidenza = merchant.confidenza ?? 92;
        categoriaFonte = 'user';
      }

      return {
        clientTxId: tx.clientTxId,
        data: tx.data,
        descrizione: tx.descrizione,
        importo: tx.importo,
        tipo: tx.tipo,
        conto_id: tx.conto_id,
        conto_nome: tx.conto_nome,
        merchant: merchant.merchant ?? null,
        merchant_id: merchant.merchantId ?? null,
        merchant_confidenza: merchant.confidenza ?? null,
        merchant_indirizzo: merchant.indirizzo ?? null,
        merchant_tipologia: merchant.activityType ?? null,
        merchant_motivazione: merchant.motivazione ?? null,
        descrizione_pulita: merchant.descrizionePulita ?? null,
        categoria_suggerita: categoriaSuggerita,
        categoria_confidenza: categoriaConfidenza,
        categoria_automatica: true,
        categoria_fonte: categoriaFonte,
        matchedPattern: match.matchedPattern ?? merchant.matchedKeyword ?? null,
        balance: tx.balance ?? null,
        isDuplicate: false,
      };
    });

    const duplicateCount = items.filter((i) => i.isDuplicate).length;
    const nuoveCount = items.filter((i) => !i.isDuplicate).length;
    const categorizzateCount = items.filter((i) => !i.isDuplicate && i.categoria_suggerita).length;
    const merchantCount = items.filter((i) => !i.isDuplicate && i.merchant).length;
    const importabiliCount = items.filter((i) => !i.isDuplicate && i.conto_id && i.categoria_suggerita).length;
    const daVerificareCount = items.filter((i) => !i.isDuplicate && (i.categoria_confidenza ?? 0) < 60).length;

    return {
      items,
      summary: {
        nuove: nuoveCount,
        duplicate: duplicateCount,
        importabili: importabiliCount,
        categorizzate: categorizzateCount,
        merchant_riconosciuti: merchantCount,
        da_verificare: daVerificareCount,
      },
      warnings,
    };
  }

  async _recalculateContoSaldo(userId, contoId, transaction) {
    const movs = await Movimento.findAll({
      where: {
        user_id: userId,
        conto_id: contoId,
        tipo: { [Op.in]: ['entrata', 'uscita'] },
      },
      transaction,
    });

    const saldo = movs.reduce((sum, m) => {
      const imp = toNumber(m.importo);
      return sum + (m.tipo === 'entrata' ? imp : -imp);
    }, 0);

    return Math.round(saldo * 100) / 100;
  }

  _getStatementEndingBalance(importabili, contoId) {
    const rows = importabili
      .filter((tx) => Number(tx.conto_id) === contoId && tx.balance !== null && tx.balance !== undefined)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    if (!rows.length) return null;
    return Math.round(toNumber(rows[0].balance) * 100) / 100;
  }

  async confirmImport(userId, transactionsToImport, { aggiornaSaldo = false } = {}) {
    if (!Array.isArray(transactionsToImport)) {
      throw Object.assign(new Error('Payload conferma non valido'), { statusCode: 400 });
    }

    // Controlli minimi: dato/descrizione/importo/tipo/conto/categoria.
    const normalizedCandidates = transactionsToImport.map((tx) => ({
      clientTxId: tx.clientTxId,
      data: tx.data,
      descrizione: tx.descrizione,
      importo: toNumber(tx.importo),
      tipo: tx.tipo,
      conto_id: tx.conto_id ?? null,
      // campo solo per ImportService, non serve ai duplicateChecker:
      categoria_finale: tx.categoria_finale ?? null,
      categoria_suggerita: tx.categoria_suggerita ?? null,
      categoria_confidenza: tx.categoria_confidenza ?? null,
      categoria_automatica: tx.categoria_automatica ?? (tx.categoria_suggerita ? true : false),
      merchant_finale: tx.merchant_finale ?? null,
      merchant_suggerito: tx.merchant ?? tx.merchant_suggerito ?? null,
      merchant_id_finale: tx.merchant_id_finale ?? null,
      merchant_id_suggerito: tx.merchant_id ?? tx.merchant_id_suggerito ?? null,
      balance: tx.balance ?? null,
    }));

    // Duplicate check (DB + interno al file).
    const checked = await this.duplicateChecker.check(userId, normalizedCandidates);

    const importabili = checked.filter((tx) => (
      !tx.isDuplicate
      && tx.conto_id
      && tx.categoria_finale
      && tx.data
      && tx.descrizione
      && toNumber(tx.importo) > 0
      && ['entrata', 'uscita'].includes(tx.tipo)
    ));

    const duplicateSaltati = checked.filter((tx) => tx.isDuplicate).length;
    const incompletiSaltati = checked.length - importabili.length - duplicateSaltati;

    const uniqueContoIds = [...new Set(importabili.map((t) => Number(t.conto_id)).filter((id) => Number.isFinite(id) && id > 0))];

    const t = await sequelize.transaction();
    try {
      const conti = await Conto.findAll({
        where: { id: uniqueContoIds, user_id: userId, attivo: true },
        transaction: t,
        ...(aggiornaSaldo ? { lock: t.LOCK.UPDATE } : {}),
      });

      const contoMap = new Map(conti.map((c) => [c.id, c]));
      if (contoMap.size !== uniqueContoIds.length) {
        throw Object.assign(new Error('Uno o più conti non validi per l’utente'), { statusCode: 400 });
      }

      for (const tx of importabili) {
        const contoId = Number(tx.conto_id);
        const conto = contoMap.get(contoId);
        if (!conto) continue;

        const importoNum = toNumber(tx.importo);
        const categoriaAutomatica = !!tx.categoria_suggerita;
        const categoriaModificata = categoriaAutomatica && tx.categoria_finale !== tx.categoria_suggerita;
        const merchantModificato = !!tx.merchant_finale
          && tx.merchant_finale !== (tx.merchant_suggerito ?? null);

        // Crea movimento.
        await Movimento.create({
          user_id: userId,
          conto_id: contoId,
          tipo: tx.tipo,
          importo: importoNum,
          categoria: tx.categoria_finale,
          categoria_automatica: categoriaAutomatica,
          categoria_confidenza: categoriaAutomatica ? (tx.categoria_confidenza ?? null) : null,
          categoria_modificata: categoriaModificata,
          descrizione: tx.descrizione,
          data: tx.data,
          ricorrente: false,
          ricorrente_frequenza: null,
          ricorrente_giorno: null,
        }, { transaction: t });

        // Apprendimento: crea/rafforza regole personali da correzioni utente.
        const shouldLearnPersonal = tx.categoria_finale || tx.merchant_finale;
        const userCorrected = !categoriaAutomatica || categoriaModificata || merchantModificato;

        if (shouldLearnPersonal && userCorrected) {
          try {
            await this.personalRulesService.learnRule({
              userId,
              descrizione: tx.descrizione,
              merchantName: tx.merchant_finale ?? tx.merchant_suggerito ?? null,
              merchantId: tx.merchant_id_finale ?? tx.merchant_id_suggerito ?? null,
              categoria: tx.categoria_finale ?? null,
              transaction: t,
            });
          } catch (e) {
            logger.warn('Personal merchant rule failed', { err: e });
          }
        }

        if (tx.categoria_finale && (!categoriaAutomatica || categoriaModificata)) {
          try {
            await this.learningService.learnRule({
              userId,
              descrizione: tx.descrizione,
              categoria: tx.categoria_finale,
              transaction: t,
            });
          } catch (e) {
            logger.warn('Learning rule failed', { err: e });
          }
        }
      }

      // Ricalcola saldo: preferisci saldo finale estratto (Revolut Balance), altrimenti somma movimenti.
      if (aggiornaSaldo) {
        for (const contoId of uniqueContoIds) {
          const conto = contoMap.get(contoId);
          if (!conto) continue;
          const endingBalance = this._getStatementEndingBalance(importabili, contoId);
          if (endingBalance !== null) {
            conto.saldo = endingBalance;
          } else {
            conto.saldo = await this._recalculateContoSaldo(userId, contoId, t);
          }
          await conto.save({ transaction: t });
        }
      }

      await t.commit();

      return {
        importati: importabili.length,
        duplicateSaltati,
        incompletiSaltati,
      };
    } catch (e) {
      await t.rollback();
      throw e;
    }
  }
}

module.exports = ImportService;

