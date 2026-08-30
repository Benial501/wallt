/**
 * Profili categoria estesi per classificazione locale (motore AI interno).
 * Ogni keyword ha un peso: match più specifici = score più alto.
 */
const PROFILES = {
  entrata: {
    stipendio: {
      keywords: ['stipendio', 'salary', 'payroll', 'busta paga', 'emolumenti', 'retribuzione', 'accredito stipendio'],
      weight: 10,
    },
    entrata_extra: {
      keywords: ['freelance', 'fattura', 'incasso', 'parcel', 'compenso', 'onorario', 'consulenza'],
      weight: 8,
    },
    regalo_ricevuto: {
      keywords: ['regalo', 'dono', 'gift'],
      weight: 7,
    },
    rendimento_investimenti: {
      keywords: ['dividendo', 'cedola', 'rendimento', 'interessi', 'coupon', 'yield'],
      weight: 9,
    },
    prelievo_scommesse: {
      keywords: ['prelievo scommesse', 'vincita scommesse', 'bet365', 'snai', 'goldbet'],
      weight: 8,
    },
    altro_entrata: {
      keywords: [
        'bonifico', 'accredito', 'ricevuto', 'incasso', 'versamento', 'entrata',
        'storno', 'rimborso', 'refund', 'cashback', 'accred', 'transfer received',
      ],
      weight: 6,
    },
  },
  uscita: {
    cibo_spesa: {
      keywords: [
        'esselunga', 'coop', 'conad', 'lidl', 'carrefour', 'eurospin', 'pam', 'md discount',
        'tigros', 'iper', 'supermercato', 'alimentari', 'grocery', 'spesa', 'market',
        'penny', 'aldi', 'famila', 'despar', 'selex', 'simply', 'bennet', 'unes',
      ],
      weight: 10,
    },
    casa: {
      keywords: [
        'affitto', 'mutuo', 'condominio', 'ikea', 'leroy merlin', 'brico', 'ob', 'manomano',
        'immobiliare', 'casa', 'affitto mensile', 'canone',
      ],
      weight: 9,
    },
    bollette: {
      keywords: [
        'enel', 'hera', 'acea', 'a2a', 'iren', 'edison', 'engie', 'sorgenia',
        'tim', 'vodafone', 'wind', 'iliad', 'fastweb', 'fibra', 'luce', 'gas',
        'acqua', 'bolletta', 'fattura', 'utenza', 'telefono', 'internet', 'energia',
      ],
      weight: 9,
    },
    benzina_trasporti: {
      keywords: [
        'eni', 'q8', 'ip', 'tamoil', 'esso', 'shell', 'repsol', 'carburante',
        'benzina', 'gasolio', 'distributore', 'autostrada', 'telepass', 'autogrill',
        'parcheggio', 'parking', 'ztl', 'pedaggio', 'noleggio auto', 'hertz', 'avis',
      ],
      weight: 9,
    },
    mezzi_pubblici: {
      keywords: [
        'trenitalia', 'italo', 'trenord', 'atm', 'atac', 'gtt', 'actv', 'bus',
        'metro', 'tram', 'ferrovia', 'biglietto', 'abbonamento trasporti', 'trenino',
      ],
      weight: 9,
    },
    abbonamenti: {
      keywords: [
        'netflix', 'spotify', 'disney', 'amazon prime', 'sky', 'dazn', 'apple',
        'google one', 'icloud', 'dropbox', 'abbonamento', 'subscription', 'premium',
        'youtube', 'hbo', 'paramount',
      ],
      weight: 8,
    },
    abbigliamento: {
      keywords: [
        'zalando', 'h&m', 'zara', 'ovs', 'benetton', 'nike', 'adidas', 'decathlon',
        'abbigliamento', 'scarpe', 'moda', 'footlocker', 'primark',
      ],
      weight: 8,
    },
    svago: {
      keywords: [
        'ristorante', 'pizzeria', 'bar', 'pub', 'trattoria', 'osteria', 'sushi',
        'cinema', 'teatro', 'concerto', 'museo', 'discoteca', 'palestra', 'gym',
        'mc donald', 'burger king', 'just eat', 'deliveroo', 'glovo', 'uber eats',
      ],
      weight: 7,
    },
    salute: {
      keywords: [
        'farmacia', 'ospedale', 'medico', 'dentista', 'laboratorio', 'analisi',
        'visita', 'clinica', 'optometria', 'occhiali', 'sanit', 'health',
      ],
      weight: 8,
    },
    regali: {
      keywords: ['regalo', 'dono', 'fiori', 'gift card'],
      weight: 7,
    },
    investimento: {
      keywords: [
        'degiro', 'trading212', 'etoro', 'fineco', 'directa', 'investimento',
        'versamento titoli', 'pac', 'etf', 'azioni', 'crypto', 'binance',
      ],
      weight: 9,
    },
    deposito_scommesse: {
      keywords: ['scommesse', 'bet365', 'snai', 'goldbet', 'sisal', 'pokerstars', 'deposito gioco'],
      weight: 8,
    },
    acquisti_vari: {
      keywords: [
        'amazon', 'amzn', 'ebay', 'shop', 'store', 'acquisto', 'acquisti',
        'marketplace', 'aliexpress', 'temu', 'shein', 'mediaworld', 'unieuro', 'euronics',
        'pos', 'pagamento pos', 'pagamento', 'e-commerce', 'online',
      ],
      weight: 6,
    },
    trasferimento_denaro: {
      keywords: [
        'bonifico', 'bonific', 'transfer', 'trasfer', 'invio', 'p2p', 'wire',
        'satispay', 'wise', 'revolut transfer', 'paypal invio', 'paypal transfer',
        'giroconto', 'disposizione', 'versamento conto', 'conto corrente',
      ],
      weight: 9,
    },
    altro_uscita: {
      keywords: [
        'prelievo', 'commissioni', 'canone', 'spese', 'imposta', 'tassa', 'bollo',
        'atm', 'bancomat', 'postamat', 'bancoposta', 'poste', 'fee', 'costo',
      ],
      weight: 4,
    },
  },
};

class CategoryKnowledgeBase {
  score({ tipo, descrizione }) {
    const profiles = PROFILES[tipo];
    if (!profiles) return null;

    const { normalizeText, tokenize, includesFuzzy } = require('./textUtils');
    const text = normalizeText(descrizione);
    const tokens = tokenize(descrizione);
    if (!text) return null;

    let best = null;

    Object.entries(profiles).forEach(([categoria, profile]) => {
      let score = 0;
      let matchedKeyword = null;

      for (const kw of profile.keywords) {
        if (includesFuzzy(text, kw)) {
          const kwScore = profile.weight + Math.min(kw.length, 20);
          if (kwScore > score) {
            score = kwScore;
            matchedKeyword = kw;
          }
        }
      }

      // Bonus token overlap: richiede uguaglianza esatta tra token, non
      // contenimento in una direzione o nell'altra (altrimenti "imbarco"
      // conterebbe come overlap con la keyword "bar", "barbieri" con "bar", ecc.
      // — lo stesso tipo di falso positivo su sottostringa corretto altrove).
      const kwTokens = profile.keywords.flatMap((k) => tokenize(k));
      const overlap = tokens.filter((t) => kwTokens.includes(t)).length;
      score += overlap * 2;

      if (score > 0 && (!best || score > best.score)) {
        best = { categoria, score, matchedKeyword };
      }
    });

    if (!best) return null;

    const confidenza = Math.min(88, 40 + best.score * 2);
    return {
      categoria: best.categoria,
      confidenza,
      matchedPattern: best.matchedKeyword,
      source: 'knowledge',
    };
  }
}

module.exports = CategoryKnowledgeBase;
