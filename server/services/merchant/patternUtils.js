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
  const norm = normalizeText(descrizione);
  if (!norm) return null;

  let s = norm.replace(/\d+/g, '').replace(/\b\d+\b/g, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 3) return null;

  const words = s.split(' ').filter(Boolean);
  const signatureWords = words.slice(0, 3).join(' ');
  if (signatureWords && signatureWords.length >= 3) return signatureWords.slice(0, 40);

  return s.slice(0, 40);
};

module.exports = {
  normalizeText,
  extractLearningPattern,
};
