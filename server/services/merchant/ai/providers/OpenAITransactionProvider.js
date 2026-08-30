const logger = require('../../../../utils/logger');
const AITransactionClassifierProvider = require('../AITransactionClassifierProvider');
const { getAllowedCategories, normalizeCategory } = require('../categoryLists');
const { pseudonymizeDescription } = require('../pseudonymizeDescription');

/**
 * Provider OpenAI per classificazione transazioni (opzionale).
 * Attivo quando OPENAI_API_KEY è impostata e l'utente ha dato consenso.
 */
class OpenAITransactionProvider extends AITransactionClassifierProvider {
  constructor() {
    super({ name: 'openai' });
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  isEnabled() {
    return !!this.apiKey;
  }

  async classify({ descrizione, cleanedDescription, tipo, importo } = {}) {
    const text = pseudonymizeDescription(String(descrizione ?? cleanedDescription ?? '').trim());
    const cleaned = pseudonymizeDescription(String(cleanedDescription ?? descrizione ?? '').trim());
    if (!text || !tipo) return null;

    const allowed = getAllowedCategories(tipo);

    const systemPrompt = `Sei un assistente finanziario per WALLT.
Analizza transazioni bancarie italiane e restituisci merchant, categoria e motivazione.
Rispondi SOLO con JSON valido:
{"merchant":"...","categoria":"...","motivazione":"...","confidenza":0-100}
Regole:
- merchant: nome commerciante plausibile estratto dalla descrizione (null se impossibile)
- categoria: UNA tra [${allowed.join(', ')}]
- motivazione: frase breve in italiano che spiega la scelta
- confidenza: 0-100`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                tipo,
                descrizione: text.slice(0, 300),
                descrizione_pulita: cleaned.slice(0, 200),
                importo: importo ?? null,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        await response.text();
        logger.warn('[AITransactionClassifier] OpenAI request failed', { status: response.status });
        return null;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
      const categoria = normalizeCategory(parsed.categoria, tipo);
      const confidenza = Math.min(100, Math.max(35, Number(parsed.confidenza) || 55));

      if (!categoria) return null;

      return {
        merchant: parsed.merchant ? String(parsed.merchant).trim().slice(0, 120) : null,
        categoria,
        motivazione: String(parsed.motivazione || 'Classificazione AI OpenAI.').slice(0, 500),
        confidenza: Math.round(confidenza),
        provider: this.name,
      };
    } catch (error) {
      logger.warn('[AITransactionClassifier] OpenAI error', { err: error });
      return null;
    }
  }
}

module.exports = OpenAITransactionProvider;
