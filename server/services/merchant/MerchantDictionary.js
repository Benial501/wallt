const DEFAULT_MERCHANTS = require('./merchantData');
const { normalizeText, normalizeMerchantName } = require('./textUtils');

/**
 * Database merchant estendibile.
 * Ogni entry: { id, name, nameNormalized, category, activityType, keywords[], confidence }
 */
class MerchantDictionary {
  constructor(initialMerchants = DEFAULT_MERCHANTS) {
    this._merchants = [];
    this._keywordIndex = new Map();
    this.registerMany(initialMerchants);
  }

  register(entry) {
    if (!entry?.id || !entry?.name) return null;

    const normalized = {
      id: entry.id,
      name: entry.name,
      nameNormalized: entry.nameNormalized || normalizeMerchantName(entry.name),
      category: entry.category,
      activityType: entry.activityType || 'other',
      keywords: [...new Set((entry.keywords || [entry.name]).map((k) => normalizeText(k)).filter(Boolean))],
      confidence: entry.confidence ?? 80,
    };

    const existingIdx = this._merchants.findIndex((m) => m.id === normalized.id);
    if (existingIdx >= 0) {
      this._removeFromIndex(this._merchants[existingIdx]);
      this._merchants[existingIdx] = normalized;
    } else {
      this._merchants.push(normalized);
    }

    this._addToIndex(normalized);
    return normalized;
  }

  registerMany(entries = []) {
    entries.forEach((entry) => this.register(entry));
    return this._merchants.length;
  }

  getAll() {
    return [...this._merchants];
  }

  getById(id) {
    return this._merchants.find((m) => m.id === id) || null;
  }

  /**
   * Cerca merchant per keyword nella descrizione normalizzata.
   */
  findCandidates(cleanedDescription) {
    const text = normalizeText(cleanedDescription);
    if (!text) return [];

    const candidates = new Map();

    for (const merchant of this._merchants) {
      for (const keyword of merchant.keywords) {
        if (!keyword || keyword.length < 2) continue;

        const matched = this._keywordMatches(text, keyword);
        if (!matched) continue;

        const scoreBoost = Math.min(keyword.length, 20);
        const current = candidates.get(merchant.id);
        const score = merchant.confidence + scoreBoost;

        if (!current || score > current.score) {
          candidates.set(merchant.id, {
            merchant,
            matchedKeyword: keyword,
            score,
          });
        }
      }
    }

    return Array.from(candidates.values()).sort((a, b) => b.score - a.score);
  }

  _keywordMatches(text, keyword) {
    if (!keyword || keyword.length < 2) return false;

    // Keyword corte: solo match esatto su token
    if (keyword.length < 4) {
      const tokens = text.split(/\s+/);
      return tokens.includes(keyword);
    }

    if (text.includes(keyword)) return true;

    const compactText = text.replace(/\s/g, '');
    const compactKeyword = keyword.replace(/\s/g, '');
    if (compactKeyword.length >= 4 && compactText.includes(compactKeyword)) return true;

    if (keyword.includes(' ')) {
      const kwTokens = keyword.split(/\s+/);
      const textTokens = text.split(/\s+/);
      return kwTokens.every((kt) => textTokens.some((tt) => tt === kt || tt.startsWith(kt)));
    }

    const tokens = text.split(/\s+/);
    return tokens.some((t) => t === keyword || (keyword.length >= 5 && t.startsWith(keyword)));
  }

  _addToIndex(merchant) {
    merchant.keywords.forEach((keyword) => {
      if (!this._keywordIndex.has(keyword)) {
        this._keywordIndex.set(keyword, []);
      }
      this._keywordIndex.get(keyword).push(merchant.id);
    });
  }

  _removeFromIndex(merchant) {
    merchant.keywords.forEach((keyword) => {
      const ids = this._keywordIndex.get(keyword);
      if (!ids) return;
      const filtered = ids.filter((id) => id !== merchant.id);
      if (filtered.length) this._keywordIndex.set(keyword, filtered);
      else this._keywordIndex.delete(keyword);
    });
  }
}

module.exports = MerchantDictionary;
