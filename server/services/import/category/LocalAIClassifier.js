const CategoryKnowledgeBase = require('./CategoryKnowledgeBase');
const { normalizeText, tokenize, jaccardSimilarity } = require('./textUtils');
const { matchesKeyword } = require('../../../utils/keywordMatch');

/**
 * Classificatore AI locale (senza API esterne).
 * Combina knowledge base + similarità testuale per assegnare sempre una categoria.
 */
class LocalAIClassifier {
  constructor() {
    this.knowledgeBase = new CategoryKnowledgeBase();
  }

  classify({ tipo, descrizione }) {
    const kbResult = this.knowledgeBase.score({ tipo, descrizione });
    if (kbResult && kbResult.confidenza >= 45) {
      return { ...kbResult, source: 'ai_local' };
    }

    // Euristica semantica leggera: parole chiave contestuali italiane bancarie.
    const text = normalizeText(descrizione);
    const tokens = tokenize(descrizione);

    const heuristics = tipo === 'entrata'
      ? [
        { categoria: 'stipendio', patterns: ['stipend', 'salary', 'payroll'], conf: 75 },
        { categoria: 'altro_entrata', patterns: ['bonific', 'accred', 'ricev', 'incass', 'storno'], conf: 62 },
        { categoria: 'entrata_extra', patterns: ['fattura', 'parcel', 'compen'], conf: 58 },
      ]
      : [
        { categoria: 'cibo_spesa', patterns: ['spesa', 'supermerc', 'aliment', 'market'], conf: 60 },
        { categoria: 'benzina_trasporti', patterns: ['benzin', 'carbur', 'distribut', 'autostr', 'telepass'], conf: 62 },
        { categoria: 'mezzi_pubblici', patterns: ['tren', 'bus', 'metro', 'bigliett'], conf: 60 },
        { categoria: 'bollette', patterns: ['bollett', 'utenz', 'luce', 'gas', 'fattur'], conf: 60 },
        { categoria: 'abbonamenti', patterns: ['abbon', 'subscription', 'premium'], conf: 58 },
        { categoria: 'svago', patterns: ['ristor', 'bar', 'pizzer', 'cinema', 'deliveroo'], conf: 55 },
        { categoria: 'acquisti_vari', patterns: ['pos', 'pagament', 'acquist', 'shop', 'amazon', 'amzn'], conf: 52 },
        { categoria: 'trasferimento_denaro', patterns: ['bonific', 'transfer', 'trasfer', 'invio', 'p2p', 'satispay', 'wise', 'girocont'], conf: 65 },
        { categoria: 'altro_uscita', patterns: ['preliev', 'commission', 'canone', 'spese', 'impost'], conf: 48 },
      ];

    // Soglia 3 (non 4): molte pattern qui sono radici intenzionalmente troncate
    // di 4+ caratteri (es. 'tren' per trenitalia/trenord, 'luce' parola intera)
    // e devono restare match a sottostringa; solo le voci di 3 caratteri o meno
    // ('bar', 'gas', 'pos', 'bus', 'p2p') sono abbastanza corte da generare
    // falsi positivi su parole non correlate (bar -&gt; barbieri/imbarco/barilla).
    for (const rule of heuristics) {
      const hit = rule.patterns.some((p) => matchesKeyword(text, p, 3));
      if (hit) {
        return {
          categoria: rule.categoria,
          confidenza: rule.conf,
          matchedPattern: rule.patterns.find((p) => matchesKeyword(text, p, 3)),
          source: 'ai_local',
        };
      }
    }

    // Similarità tra token e profili categoria (fallback morbido).
    if (kbResult) {
      return { ...kbResult, confidenza: Math.max(38, kbResult.confidenza), source: 'ai_local' };
    }

    // Ultimo fallback: categoria generica per tipo (sempre assegna qualcosa).
    const defaultCategoria = tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita';
    const tokenHint = tokens.slice(0, 2).join(' ') || text.slice(0, 20);

    return {
      categoria: defaultCategoria,
      confidenza: 32,
      matchedPattern: tokenHint,
      source: 'ai_default',
    };
  }

  classifyBatch(transactions) {
    return transactions.map((tx) => ({
      clientTxId: tx.clientTxId,
      ...this.classify({ tipo: tx.tipo, descrizione: tx.descrizione }),
      categoria_automatica: true,
    }));
  }
}

module.exports = LocalAIClassifier;
