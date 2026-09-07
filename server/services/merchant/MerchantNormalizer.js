const { normalizeText } = require('./textUtils');

/**
 * Pattern bancari / POS / SEPA da rimuovere dalle descrizioni grezze.
 */
const NOISE_PATTERNS = [
  /\bpagamento\s+pos\b/gi,
  /\bcard\s+payment\b/gi,
  /\bpagamento\s+carta\b/gi,
  /\bpagamento\s+elettronico\b/gi,
  /\bacquisto\s+pos\b/gi,
  /\bpos\s+contactless\b/gi,
  /\bcontactless\b/gi,
  /\bpos\b/gi,
  /\bsepa\s+sdd\b/gi,
  /\bsepa\s+sct\b/gi,
  /\bsepa\b/gi,
  /\bsdd\b/gi,
  /\bsct\b/gi,
  /\btrx\b/gi,
  /\btrn\b/gi,
  /\bref\b/gi,
  /\brif\b/gi,
  /\bid\s*[:.]?\s*\d+/gi,
  /\bterminal[e]?\s*[:.]?\s*\d+/gi,
  /\bcod\s*[:.]?\s*\d+/gi,
  /\baut\s*[:.]?\s*\d+/gi,
  /\bauth\b/gi,
  /\beft\b/gi,
  /\bvisa\b/gi,
  /\bmastercard\b/gi,
  /\bmaestro\b/gi,
  /\bvisa\s+debit\b/gi,
  /\bvisa\s+credit\b/gi,
  /\bpaypal\s*\*\s*/gi,
  /\bpaypal\b/gi,
  /\bsumup\b/gi,
  /\bstripe\b/gi,
  /\bsatispay\b/gi,
  /\bapple\s+pay\b/gi,
  /\bgoogle\s+pay\b/gi,
  /\boperazione\b/gi,
  /\btransazione\b/gi,
  /\baddebito\b/gi,
  /\baccredito\b/gi,
];

/**
 * Elimina rumore dalle descrizioni bancarie.
 */
class MerchantNormalizer {
  normalize(rawDescription) {
    const original = String(rawDescription ?? '').trim();
    if (!original) {
      return { original, cleaned: '', tokens: [] };
    }

    let cleaned = original.replace(/\b\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?\b/g, ' ');

    cleaned = cleaned
      .replace(/^(to|from|payment to|transfer to|transfer from)\s+/i, ' ')
      .replace(/\s+(to|from)\s+[a-z0-9].*$/i, ' ');

    NOISE_PATTERNS.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, ' ');
    });

    // Codici alfanumerici con almeno una cifra (terminal ID, TRX codes) — non parole merchant
    cleaned = cleaned.replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{6,}\b/g, ' ');
    // Sequenze numeriche lunghe
    cleaned = cleaned.replace(/\b\d{4,}\b/g, ' ');
    // Numeri corti isolati (spesso ID POS)
    cleaned = cleaned.replace(/\b\d{1,3}\b/g, ' ');

    cleaned = normalizeText(cleaned)
      .replace(/\b(?:amzn mktp(?: it)?|amazon eu(?: sarl)?|amazon it|amazon payments)\b/g, 'amazon');
    cleaned = this._stripTrailingCity(cleaned).replace(/\s+/g, ' ').trim();

    const tokens = cleaned
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    return {
      original,
      cleaned,
      tokens,
    };
  }

  _stripTrailingCity(text) {
    if (!text) return text;
    const cities = [
      'milano', 'roma', 'napoli', 'torino', 'palermo', 'genova', 'bologna', 'firenze', 'bari',
      'catania', 'venezia', 'verona', 'parma', 'modena', 'padova', 'trieste', 'brescia',
      'perugia', 'monza', 'bergamo', 'bolzano', 'trento', 'ancona', 'lecce', 'pisa', 'udine',
      'livorno', 'ravenna', 'cagliari', 'foggia', 'rimini', 'salerno', 'ferrara', 'sassari',
      'latina', 'pescara', 'vicenza', 'taranto', 'prato',
    ];
    const tokens = text.split(/\s+/).filter(Boolean);
    while (tokens.length > 1 && cities.includes(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    return tokens.join(' ');
  }
}

module.exports = MerchantNormalizer;
