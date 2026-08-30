const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { BudgetMensile, BudgetCategoria, Movimento, ProfiloUtente } = require('../models');
const { calcolaBudgetSuggerito } = require('./profilo.controller');

const toNumber = (val) => parseFloat(val) || 0;

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

const getMovimentiCategorie = (budgetCategoria) =>
  BUDGET_TO_MOVIMENTI[budgetCategoria] || [budgetCategoria];

const getStato = (percentuale) => {
  if (percentuale > 100) return 'superato';
  if (percentuale > 85) return 'attenzione';
  if (percentuale > 60) return 'attenzione';
  return 'ok';
};

const getBudget = async (req, res) => {
  try {
    const mese = parseInt(req.params.mese, 10);
    const anno = parseInt(req.params.anno, 10);

    const budget = await BudgetMensile.findOne({
      where: { user_id: req.userId, mese, anno },
      include: [{ model: BudgetCategoria, as: 'categorie' }],
    });

    if (!budget) {
      const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
      let suggerito = null;
      if (profilo && profilo.entrata_mensile) {
        suggerito = calcolaBudgetSuggerito(profilo);
      }
      return res.json({ esiste: false, suggerito });
    }

    res.json({ esiste: true, budget });
  } catch (error) {
    logger.error('Errore getBudget', { err: error });
    res.status(500).json({ message: 'Errore nel recupero del budget' });
  }
};

const createBudget = async (req, res) => {
  try {
    const { mese, anno, importo_totale, categorie } = req.body;

    if (!mese || !anno || !importo_totale || !categorie?.length) {
      return res.status(400).json({ message: 'Dati budget incompleti' });
    }

    const esistente = await BudgetMensile.findOne({
      where: { user_id: req.userId, mese, anno },
    });

    if (esistente) {
      return res.status(409).json({ message: 'Budget già esistente per questo mese' });
    }

    const budget = await BudgetMensile.create({
      user_id: req.userId,
      mese,
      anno,
      importo_totale,
      generato_da_ai: false,
    });

    const categorieCreate = await Promise.all(
      categorie.map((cat) =>
        BudgetCategoria.create({
          budget_id: budget.id,
          categoria: cat.categoria,
          percentuale: cat.percentuale,
          importo: cat.importo,
        })
      )
    );

    res.status(201).json({
      budget: { ...budget.toJSON(), categorie: categorieCreate },
    });
  } catch (error) {
    logger.error('Errore createBudget', { err: error });
    res.status(500).json({ message: 'Errore nella creazione del budget' });
  }
};

const updateBudget = async (req, res) => {
  try {
    const budget = await BudgetMensile.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });

    if (!budget) {
      return res.status(404).json({ message: 'Budget non trovato' });
    }

    const { importo_totale, categorie } = req.body;

    if (importo_totale !== undefined) {
      await budget.update({ importo_totale });
    }

    if (categorie?.length) {
      await BudgetCategoria.destroy({ where: { budget_id: budget.id } });
      await Promise.all(
        categorie.map((cat) =>
          BudgetCategoria.create({
            budget_id: budget.id,
            categoria: cat.categoria,
            percentuale: cat.percentuale,
            importo: cat.importo,
          })
        )
      );
    }

    const budgetAggiornato = await BudgetMensile.findByPk(budget.id, {
      include: [{ model: BudgetCategoria, as: 'categorie' }],
    });

    res.json({ budget: budgetAggiornato });
  } catch (error) {
    logger.error('Errore updateBudget', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento del budget' });
  }
};

const getStatoBudget = async (req, res) => {
  try {
    const mese = parseInt(req.params.mese, 10);
    const anno = parseInt(req.params.anno, 10);

    const budget = await BudgetMensile.findOne({
      where: { user_id: req.userId, mese, anno },
      include: [{ model: BudgetCategoria, as: 'categorie' }],
    });

    if (!budget) {
      return res.status(404).json({ message: 'Budget non trovato per questo mese' });
    }

    const dataInizio = `${anno}-${String(mese).padStart(2, '0')}-01`;
    const ultimoGiorno = new Date(anno, mese, 0).getDate();
    const dataFine = `${anno}-${String(mese).padStart(2, '0')}-${ultimoGiorno}`;

    const movimenti = await Movimento.findAll({
      where: {
        user_id: req.userId,
        tipo: 'uscita',
        data: { [Op.between]: [dataInizio, dataFine] },
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
        categoria: cat.categoria,
        budget_importo: budgetImporto,
        speso,
        rimanente,
        percentuale_usata: percentualeUsata,
        stato: getStato(percentualeUsata),
      };
    });

    res.json({ stato, budget });
  } catch (error) {
    logger.error('Errore getStatoBudget', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo dello stato budget' });
  }
};

module.exports = { getBudget, createBudget, updateBudget, getStatoBudget };
