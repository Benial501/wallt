const { Op } = require('sequelize');
const { BudgetMensile, BudgetCategoria, Movimento } = require('../models');

/**
 * Calcolo dello stato di avanzamento del budget mensile.
 *
 * Logica estratta da `controllers/budget.controller.js` senza modifiche di
 * comportamento: serve sia all'API `/api/budget/:anno/:mese/stato` sia al
 * generatore di notifiche, e duplicarla avrebbe voluto dire due definizioni
 * di "percentuale usata" che possono divergere.
 */

const toNumber = (val) => parseFloat(val) || 0;

/**
 * Una categoria di budget può raggruppare più categorie di movimento
 * (es. "acquisti" copre acquisti_vari e regali).
 */
const BUDGET_TO_MOVIMENTI = {
  cibo: ['cibo_spesa'],
  cibo_spesa: ['cibo_spesa'],
  svago: ['svago'],
  abbigliamento: ['abbigliamento'],
  risparmio: [],
  investimento: ['investimento'],
  acquisti: ['acquisti_vari', 'regali'],
  acquisti_vari: ['acquisti_vari', 'regali'],
  salute: ['salute'],
  scommesse: ['deposito_scommesse'],
  deposito_scommesse: ['deposito_scommesse'],
  casa: ['casa'],
  bollette: ['bollette'],
  benzina: ['benzina_trasporti'],
  benzina_trasporti: ['benzina_trasporti'],
  mezzi_pubblici: ['mezzi_pubblici'],
};

const { CATEGORIE_DEFAULT } = require('../constants/categorie');
const GROUPS_FOR_LEGACY = {
  cibo: ['Alimentazione'], cibo_spesa: ['Alimentazione'], svago: ['Intrattenimento', 'Viaggi', 'Sport e benessere'],
  acquisti: ['Shopping'], acquisti_vari: ['Shopping'], salute: ['Salute'],
  benzina_trasporti: ['Trasporti'], benzina: ['Trasporti'],
};
const HOME_UTILITIES = ['elettricita', 'gas', 'acqua', 'internet', 'telefono'];
const getMovimentiCategorie = budgetCategoria => {
  const base = BUDGET_TO_MOVIMENTI[budgetCategoria] || [budgetCategoria];
  const extra = CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita' && (
    GROUPS_FOR_LEGACY[budgetCategoria]?.includes(c.gruppo)
    || (budgetCategoria === 'casa' && c.gruppo === 'Casa' && !HOME_UTILITIES.includes(c.id))
    || (budgetCategoria === 'bollette' && HOME_UTILITIES.includes(c.id))
    || (budgetCategoria === 'abbonamenti' && ['streaming', 'musica', 'abbonamenti_digitali'].includes(c.id))
  )).map(c => c.id);
  return [...new Set([...base, ...extra])];
};

const getStato = (percentuale) => {
  if (percentuale > 100) return 'superato';
  if (percentuale > 85) return 'attenzione';
  if (percentuale > 60) return 'attenzione';
  return 'ok';
};

/** Primo e ultimo giorno del mese in formato 'YYYY-MM-DD'. */
const intervalloMese = (anno, mese) => {
  const inizio = `${anno}-${String(mese).padStart(2, '0')}-01`;
  const ultimoGiorno = new Date(anno, mese, 0).getDate();
  const fine = `${anno}-${String(mese).padStart(2, '0')}-${ultimoGiorno}`;
  return { inizio, fine };
};

/**
 * @returns {Promise<{budget: object, stato: object[]}|null>} null se l'utente
 * non ha un budget per quel mese.
 */
const calcolaStatoBudget = async ({ userId, mese, anno }) => {
  const budget = await BudgetMensile.findOne({
    where: { user_id: userId, mese, anno },
    include: [{ model: BudgetCategoria, as: 'categorie' }],
  });

  if (!budget) return null;

  const { inizio, fine } = intervalloMese(anno, mese);

  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      data: { [Op.between]: [inizio, fine] },
    },
  });

  const spesoPerCategoria = {};
  movimenti.forEach((m) => {
    const cat = m.categoria || 'altro_uscita';
    spesoPerCategoria[cat] = (spesoPerCategoria[cat] || 0) + toNumber(m.importo);
  });

  const stato = budget.categorie.map((cat) => {
    const movimentiCats = getMovimentiCategorie(cat.categoria);
    let speso = 0;
    movimentiCats.forEach((mc) => {
      speso += spesoPerCategoria[mc] || 0;
    });
    if (movimentiCats.length === 0) {
      speso = spesoPerCategoria[cat.categoria] || 0;
    }

    speso = Math.round(speso * 100) / 100;
    const budgetImporto = toNumber(cat.importo);
    const rimanente = Math.round((budgetImporto - speso) * 100) / 100;
    const percentualeUsata = budgetImporto > 0
      ? Math.round((speso / budgetImporto) * 10000) / 100
      : 0;

    return {
      categoria_id: cat.id,
      categoria: cat.categoria,
      budget_importo: budgetImporto,
      speso,
      rimanente,
      percentuale_usata: percentualeUsata,
      stato: getStato(percentualeUsata),
    };
  });

  return { budget, stato };
};

module.exports = {
  BUDGET_TO_MOVIMENTI,
  getMovimentiCategorie,
  getStato,
  intervalloMese,
  calcolaStatoBudget,
};
