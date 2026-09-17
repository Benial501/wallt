const { Conto, Investimento } = require('../models');

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

/**
 * Patrimonio = somma saldi conti attivi + saldo attuale investimenti attivi
 * (Regola di business #12, CLAUDE.md). Unico punto di calcolo: prima esisteva
 * copiato in 4 file, e uno di questi (analisi.controller.js#getSuggerimenti)
 * aveva divergiuto — sommava solo i conti.
 */
async function calcolaPatrimonio(userId, { transaction } = {}) {
  const [conti, investimenti] = await Promise.all([
    Conto.findAll({ where: { user_id: userId, attivo: true }, transaction }),
    Investimento.findAll({ where: { user_id: userId, attivo: true }, transaction }),
  ]);

  const patrimonio_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));
  const patrimonio_investimenti = round2(investimenti.reduce((sum, i) => sum + toNumber(i.saldo_attuale), 0));
  const patrimonio_totale = round2(patrimonio_conti + patrimonio_investimenti);

  return {
    conti,
    investimenti,
    patrimonio_conti,
    patrimonio_investimenti,
    patrimonio_totale,
  };
}

module.exports = { calcolaPatrimonio, toNumber, round2 };
