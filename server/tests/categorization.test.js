// Test unitari sui motori di categorizzazione dell'import. Non richiedono dati
// applicativi specifici, ma condividono comunque la connessione DB dell'ambiente
// di test tramite tests/setup.js (setupFilesAfterEach globale del progetto).
require('./setup');

const { matchesKeyword } = require('../utils/keywordMatch');
const CategoryMatcher = require('../services/import/CategoryMatcher');
const LocalAIClassifier = require('../services/import/category/LocalAIClassifier');
const CategoryKnowledgeBase = require('../services/import/category/CategoryKnowledgeBase');

describe('matchesKeyword (protezione falsi positivi su keyword corte)', () => {
  it('rifiuta match a sottostringa per keyword di 4 caratteri o meno', () => {
    expect(matchesKeyword('pagamento skiper srl', 'ip')).toBe(false);
    expect(matchesKeyword('optimum club milano', 'tim')).toBe(false);
    expect(matchesKeyword('barbieri milano', 'bar')).toBe(false);
  });

  it('accetta match quando la keyword corta è un token intero', () => {
    expect(matchesKeyword('pagamento ip spa', 'ip')).toBe(true);
    expect(matchesKeyword('ricarica tim spa', 'tim')).toBe(true);
    expect(matchesKeyword('bar centrale milano', 'bar')).toBe(true);
  });

  it('mantiene il match a sottostringa per keyword lunghe (>4 caratteri)', () => {
    expect(matchesKeyword('acquisto esselungaonline', 'esselunga')).toBe(true);
  });

  it('tratta le keyword multi-parola come sottostringa (indipendentemente dalla lunghezza)', () => {
    expect(matchesKeyword('rimborso spese trasferta agosto', 'rimborso spese')).toBe(true);
  });

  it('supporta una soglia personalizzata per liste con radici intenzionali più lunghe', () => {
    // LocalAIClassifier usa soglia 3 invece di 4 per preservare radici come "tren"
    // (trenitalia/trenord), che restano match a sottostringa; "bar" (3 caratteri)
    // resta comunque protetto come token esatto anche con questa soglia più bassa.
    expect(matchesKeyword('trenolocale in ritardo', 'tren', 3)).toBe(true);
    expect(matchesKeyword('barbieri milano', 'bar', 3)).toBe(false);
    expect(matchesKeyword('bar centrale milano', 'bar', 3)).toBe(true);
  });
});

describe('CategoryMatcher (legacy, server/services/import/CategoryMatcher.js)', () => {
  let matcher;
  beforeEach(() => { matcher = new CategoryMatcher(); });

  it('non categorizza più "OPTIMUM SRL" come bollette per via della keyword "tim"', () => {
    const categoria = matcher.match({ tipo: 'uscita', descrizione: 'PAGAMENTO POS OPTIMUM SRL' });
    expect(categoria).not.toBe('bollette');
  });

  it('non categorizza più "SKIPER SRL" come benzina_trasporti per via della keyword "ip"', () => {
    const categoria = matcher.match({ tipo: 'uscita', descrizione: 'PAGAMENTO POS SKIPER SRL' });
    expect(categoria).not.toBe('benzina_trasporti');
  });

  it('continua a riconoscere IP come benzina_trasporti quando è un token intero', () => {
    const categoria = matcher.match({ tipo: 'uscita', descrizione: 'CARBURANTE IP SPA VIA ROMA' });
    expect(categoria).toBe('benzina_trasporti');
  });

  it('continua a riconoscere TIM come bollette quando è un token intero', () => {
    const categoria = matcher.match({ tipo: 'uscita', descrizione: 'RICARICA TIM SPA' });
    expect(categoria).toBe('bollette');
  });

  it('usa descrizionePulita quando disponibile, riducendo il rumore bancario nel testo analizzato', () => {
    const categoria = matcher.match({
      tipo: 'uscita',
      descrizione: 'PAGAMENTO POS 12/08 CARTA*1234 ESSELUNGA VIA ROMA MILANO IT',
      descrizionePulita: 'esselunga via roma',
    });
    expect(categoria).toBe('cibo_spesa');
  });
});

describe('CategoryKnowledgeBase (server/services/import/category/CategoryKnowledgeBase.js)', () => {
  let kb;
  beforeEach(() => { kb = new CategoryKnowledgeBase(); });

  it('non classifica più "BARBIERI MILANO" come svago per via della keyword "bar"', () => {
    const result = kb.score({ tipo: 'uscita', descrizione: 'PAGAMENTO POS BARBIERI MILANO' });
    expect(result?.categoria).not.toBe('svago');
  });

  it('non classifica più "IMBARCO TRAGHETTO NAPOLI" come svago per via della keyword "bar"', () => {
    const result = kb.score({ tipo: 'uscita', descrizione: 'IMBARCO TRAGHETTO NAPOLI' });
    expect(result?.categoria).not.toBe('svago');
  });

  it('continua a classificare un vero bar come svago', () => {
    const result = kb.score({ tipo: 'uscita', descrizione: 'BAR CENTRALE MILANO' });
    expect(result?.categoria).toBe('svago');
  });

  it('non classifica più "GASOLIO SELF SERVICE" come bollette per via della keyword "gas"', () => {
    const result = kb.score({ tipo: 'uscita', descrizione: 'GASOLIO SELF SERVICE' });
    expect(result?.categoria).not.toBe('bollette');
  });
});

describe('LocalAIClassifier (server/services/import/category/LocalAIClassifier.js)', () => {
  let classifier;
  beforeEach(() => { classifier = new LocalAIClassifier(); });

  it('non classifica "BARILLA SPA" come svago', () => {
    const result = classifier.classify({ tipo: 'uscita', descrizione: 'BARILLA SPA PAGAMENTO' });
    expect(result.categoria).not.toBe('svago');
  });

  it('classifica correttamente Trenitalia come mezzi_pubblici', () => {
    const result = classifier.classify({ tipo: 'uscita', descrizione: 'TRENITALIA BIGLIETTO' });
    expect(result.categoria).toBe('mezzi_pubblici');
  });

  it('assegna sempre una categoria (mai null) anche per testo non riconosciuto', () => {
    const result = classifier.classify({ tipo: 'uscita', descrizione: 'XYZQWERTY12345' });
    expect(result.categoria).toBe('altro_uscita');
    expect(result.confidenza).toBeGreaterThan(0);
  });
});
