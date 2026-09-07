const stripAccents = (str) => str.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeText = (value) => (
  stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[€$£¥]/g, '')
    .replace(/[_\-./#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

/**
 * Estrae una firma stabile dalla descrizione bancaria per il matching futuro.
 */
const extractLearningPattern = (descrizione) => {
  const MerchantNormalizer = require('./MerchantNormalizer');
  const { cleaned } = new MerchantNormalizer().normalize(descrizione);
  const norm = normalizeText(cleaned).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (norm.length < 3 || /^(?:pagamento|pos|bonifico|sepa|carta|prelievo|versamento)$/.test(norm)) return null;
  return norm.slice(0, 255);
};

module.exports = {
  normalizeText,
  extractLearningPattern,
};
