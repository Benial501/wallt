const { Op } = require('sequelize');
const { Conto, Investimento, Debito, Movimento } = require('../models');
const { muoveSaldo } = require('./ricorrenti.service');

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

/** Passività = somma saldo_residuo dei debiti attivi. */
async function calcolaPassivita(userId, { transaction } = {}) {
  const debiti = await Debito.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const passivita_totale = round2(debiti.reduce((sum, d) => sum + toNumber(d.saldo_residuo), 0));
  return { debiti, passivita_totale };
}

/**
 * Patrimonio netto = attività finanziarie (conti + investimenti) - passività
 * (debiti). Non sostituisce patrimonio_totale (che resta le sole attività,
 * come oggi): lo affianca, additivo.
 */
async function calcolaPatrimonioNetto(userId, { transaction } = {}) {
  const patrimonio = await calcolaPatrimonio(userId, { transaction });
  const { passivita_totale } = await calcolaPassivita(userId, { transaction });
  return {
    ...patrimonio,
    passivita_totale,
    patrimonio_netto: round2(patrimonio.patrimonio_totale - passivita_totale),
  };
}

/**
 * Variazione del patrimonio nel mese in corso (dal primo giorno del mese a
 * oggi): somma le entrate e sottrae le uscite che hanno davvero mosso denaro
 * (vedi muoveSaldo, ricorrenti.service.js) — una ricorrenza appena creata
 * (regola, non movimento avvenuto) non deve far apparire un calo o una
 * crescita di patrimonio che non c'è ancora stata.
 *
 * Punto sorgente unico: prima era duplicato in due controller
 * (conti.controller.js#getPatrimonioTotale e
 * analisi.controller.js#getSuggerimenti) e solo il primo applicava il
 * filtro — la home e i suggerimenti potevano quindi raccontare due storie
 * diverse dello stesso mese (CLAUDE.md Regola 20).
 */
async function calcolaVariazioneMensile(userId, { transaction, riferimento = new Date() } = {}) {
  const primoGiorno = new Date(riferimento.getFullYear(), riferimento.getMonth(), 1);
  const dataInizio = primoGiorno.toISOString().split('T')[0];

  const movimentiMese = await Movimento.findAll({
    where: {
      user_id: userId,
      data: { [Op.gte]: dataInizio },
      tipo: { [Op.in]: ['entrata', 'uscita'] },
    },
    transaction,
  });

  let delta = 0;
  movimentiMese.filter(muoveSaldo).forEach((m) => {
    delta += m.tipo === 'entrata' ? toNumber(m.importo) : -toNumber(m.importo);
  });

  return round2(delta);
}

module.exports = {
  calcolaPatrimonio, calcolaPassivita, calcolaPatrimonioNetto, calcolaVariazioneMensile, toNumber, round2,
};
