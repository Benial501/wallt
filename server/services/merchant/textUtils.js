const stripAccents = (str) => str.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalizeText = (value) => (
  stripAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/[€$£¥]/g, '')
    .replace(/[_\-./#*+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const normalizeMerchantName = (value) => normalizeText(value).replace(/\s+/g, ' ');

module.exports = {
  normalizeText,
  normalizeMerchantName,
};
