const logger = require('../../../utils/logger');
const { normalizeText } = require('./textUtils');
const { pseudonymizeDescription } = require('../../merchant/ai/pseudonymizeDescription');

const {
  CATEGORIE_ENTRATA_AI,
  CATEGORIE_USCITA_AI,
} = require('../../../constants/categorie');

const ENTRATA_CATEGORIE = CATEGORIE_ENTRATA_AI;
const USCITA_CATEGORIE = CATEGORIE_USCITA_AI;

/**
 * Classificatore opzionale via OpenAI (se OPENAI_API_KEY è configurata).
 * Usato in batch solo con consenso utente use_ai_categorization.
 */
class OpenAICategoryClassifier {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.enabled = Boolean(this.apiKey);
  }

  isEnabled() {
    return this.enabled;
  }

  async classifyBatch(transactions, { useAiCategorization = false } = {}) {
    if (!this.enabled || !useAiCategorization || !transactions.length) return [];

    logger.info('AI categorization requested');

    const payload = transactions.map((tx) => ({
      id: tx.clientTxId,
      tipo: tx.tipo,
      descrizione: pseudonymizeDescription(String(tx.descrizione ?? '')).slice(0, 200),
      importo: tx.importo,
    }));

    const systemPrompt = `Sei un assistente finanziario per l'app WALLT.
Classifica ogni transazione bancaria italiana in UNA categoria.
Rispondi SOLO con JSON valido: {"results":[{"id":"...","categoria":"...","confidenza":0-100}]}
Categorie entrata: ${ENTRATA_CATEGORIE.join(', ')}
Categorie uscita: ${USCITA_CATEGORIE.join(', ')}
Usa la categoria più plausibile anche se non sei sicuro (confidenza 40-70).
Mai lasciare categoria vuota.`;

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
            { role: 'user', content: JSON.stringify({ transazioni: payload }) },
          ],
        }),
      });

      if (!response.ok) {
        await response.text();
        logger.warn('[OpenAICategoryClassifier] request failed', { status: response.status });
        return [];
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      const results = parsed.results || parsed.transazioni || [];

      const allowed = (tipo) => (tipo === 'entrata' ? ENTRATA_CATEGORIE : USCITA_CATEGORIE);

      return results.map((r) => {
        const tx = transactions.find((t) => t.clientTxId === r.id);
        const tipo = tx?.tipo;
        const cats = allowed(tipo);
        const categoria = cats.includes(r.categoria)
          ? r.categoria
          : (tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita');

        return {
          clientTxId: r.id,
          categoria,
          confidenza: Math.min(100, Math.max(35, Number(r.confidenza) || 55)),
          matchedPattern: normalizeText(tx?.descrizione).slice(0, 40),
          source: 'openai',
          categoria_automatica: true,
        };
      });
    } catch (error) {
      logger.warn('[OpenAICategoryClassifier] error', { err: error });
      return [];
    }
  }
}

module.exports = OpenAICategoryClassifier;
