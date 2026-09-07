const logger = require('../utils/logger');
const { BudgetMensile, BudgetCategoria, ProfiloUtente } = require('../models');
const { calcolaBudgetSuggerito } = require('./profilo.controller');
// Il calcolo dello stato vive in un service condiviso: lo usano anche le
// notifiche di budget (services/notifiche/NotificheGenerator.js), e due copie
// della stessa formula finirebbero per divergere.
const { calcolaStatoBudget } = require('../services/budgetStato.service');

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

    const risultato = await calcolaStatoBudget({ userId: req.userId, mese, anno });

    if (!risultato) {
      return res.status(404).json({ message: 'Budget non trovato per questo mese' });
    }

    res.json({ stato: risultato.stato, budget: risultato.budget });
  } catch (error) {
    logger.error('Errore getStatoBudget', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo dello stato budget' });
  }
};

module.exports = { getBudget, createBudget, updateBudget, getStatoBudget };
