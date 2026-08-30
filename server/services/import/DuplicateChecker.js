const { Op } = require('sequelize');
const { Movimento } = require('../../models');
const { normalizeText, tokenize, jaccardSimilarity } = require('../import/category/textUtils');

// Sopra questa soglia di similarità tra i token delle descrizioni, due
// transazioni con stessa data/importo/conto sono considerate lo stesso
// movimento anche se il testo non è identico al carattere (banche diverse,
// o la stessa banca in export successivi, possono variare leggermente la
// formattazione della descrizione tra un file e l'altro).
const SIMILARITY_DUPLICATE_THRESHOLD = 0.5;

const toFixed2Key = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0.00';
  return Math.round(n * 100) / 100;
};

const buildKey = (tx) => {
  // Duplicato se coincidono: data, importo, descrizione, conto.
  return `${tx.data}|${toFixed2Key(tx.importo)}|${normalizeText(tx.descrizione)}|${tx.conto_id ?? 'null'}`;
};

/**
 * Responsabilità: marcare duplicati (tra righe del file e rispetto allo storico DB).
 */
class DuplicateChecker {
  constructor({ movimentoModel = Movimento } = {}) {
    this.Movimento = movimentoModel;
  }

  async check(userId, normalizedTransactions) {
    const duplicates = new Array(normalizedTransactions.length).fill(false);

    // 1) Deduplica interna del file (stessa chiave ripetuta).
    const seen = new Set();
    normalizedTransactions.forEach((tx, idx) => {
      const key = buildKey(tx);
      if (seen.has(key)) {
        duplicates[idx] = true;
      } else {
        seen.add(key);
      }
    });

    // 2) Duplicati rispetto al DB (solo se conto_id risolto).
    const candidates = normalizedTransactions
      .map((tx, idx) => ({ tx, idx }))
      .filter(({ tx }) => tx.conto_id !== null && tx.conto_id !== undefined);

    if (!candidates.length) {
      return normalizedTransactions.map((tx, idx) => ({ ...tx, isDuplicate: duplicates[idx] }));
    }

    const uniqueContoIds = [...new Set(candidates.map(({ tx }) => tx.conto_id))];
    const uniqueDates = [...new Set(candidates.map(({ tx }) => tx.data))];

    const dbRows = await this.Movimento.findAll({
      where: {
        user_id: userId,
        conto_id: { [Op.in]: uniqueContoIds },
        data: { [Op.in]: uniqueDates },
      },
      attributes: ['data', 'importo', 'descrizione', 'conto_id'],
    });

    const dbKeys = new Set(dbRows.map((m) => buildKey({
      data: m.data,
      importo: m.importo,
      descrizione: m.descrizione,
      conto_id: m.conto_id,
    })));

    normalizedTransactions.forEach((tx, idx) => {
      if (duplicates[idx]) return;
      const key = buildKey(tx);
      if (dbKeys.has(key)) duplicates[idx] = true;
    });

    // 3) Fallback per similarità: stessa data/importo/conto ma descrizione non
    // identica al carattere (es. un secondo export dello stesso estratto conto
    // con formattazione leggermente diversa per la stessa transazione). Senza
    // questo controllo, ricaricando a distanza di un mese un file che include
    // di nuovo alcune righe già importate, quelle righe rischierebbero di
    // essere reimportate come nuovi movimenti duplicati.
    const dbRowsByDateContoImporto = new Map();
    dbRows.forEach((m) => {
      const bucketKey = `${m.data}|${toFixed2Key(m.importo)}|${m.conto_id ?? 'null'}`;
      const bucket = dbRowsByDateContoImporto.get(bucketKey) || [];
      bucket.push(tokenize(m.descrizione));
      dbRowsByDateContoImporto.set(bucketKey, bucket);
    });

    normalizedTransactions.forEach((tx, idx) => {
      if (duplicates[idx]) return;
      if (tx.conto_id === null || tx.conto_id === undefined) return;

      const bucketKey = `${tx.data}|${toFixed2Key(tx.importo)}|${tx.conto_id}`;
      const bucket = dbRowsByDateContoImporto.get(bucketKey);
      if (!bucket?.length) return;

      const txTokens = tokenize(tx.descrizione);
      if (!txTokens.length) return;

      const isSimilarToExisting = bucket.some(
        (dbTokens) => jaccardSimilarity(txTokens, dbTokens) >= SIMILARITY_DUPLICATE_THRESHOLD,
      );
      if (isSimilarToExisting) duplicates[idx] = true;
    });

    return normalizedTransactions.map((tx, idx) => ({
      ...tx,
      isDuplicate: duplicates[idx],
    }));
  }
}

module.exports = DuplicateChecker;

