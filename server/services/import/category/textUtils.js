const { matchesKeyword } = require('../../../utils/keywordMatch');

const stripAccents = (str) => str.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeText = (value) => (
  stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[€$£¥]/g, '')
    .replace(/[_\-./#*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const IT_STOPWORDS = new Set([
  'di', 'da', 'del', 'della', 'dei', 'delle', 'il', 'la', 'lo', 'gli', 'le',
  'un', 'una', 'uno', 'per', 'con', 'su', 'in', 'al', 'alla', 'dal', 'dalla',
  'the', 'and', 'pos', 'pag', 'pagamento', 'operazione', 'transazione', 'trx',
  'carta', 'card', 'bancomat', 'atm', 'sepa', 'sdd', 'sct', 'n', 'nr', 'rif',
]);

const tokenize = (value) => {
  const norm = normalizeText(value);
  if (!norm) return [];
  return norm
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t.length >= 2 && !IT_STOPWORDS.has(t) && !/^\d+$/.test(t));
};

const jaccardSimilarity = (tokensA, tokensB) => {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  setA.forEach((t) => { if (setB.has(t)) intersection += 1; });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
};

const includesFuzzy = (haystack, needle) => {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  if (matchesKeyword(h, n)) return true;
  // Variante "compatta": gestisce keyword multi-parola scritte senza spazi
  // nella descrizione (es. "MC DONALD" vs "MCDONALD"). Soglia 4 sulla
  // versione compatta per evitare falsi positivi su frammenti troppo corti.
  if (n.length >= 4 && h.replace(/\s/g, '').includes(n.replace(/\s/g, ''))) return true;
  return false;
};

module.exports = {
  normalizeText,
  tokenize,
  jaccardSimilarity,
  includesFuzzy,
};
