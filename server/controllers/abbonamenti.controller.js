const logger = require('../utils/logger');
const abbonamenti = require('../services/abbonamenti.service');

const gestisciErrore = (res, error, contesto, messaggio) => {
  if (error.isOperational) return res.status(error.statusCode).json({ message: error.message });
  logger.error(contesto, { err: error });
  return res.status(500).json({ message: messaggio });
};

const getAbbonamenti = async (req, res) => {
  try {
    return res.json(await abbonamenti.elenco(req.userId));
  } catch (error) {
    return gestisciErrore(res, error, 'Errore getAbbonamenti', 'Errore nel recupero degli abbonamenti');
  }
};

const createAbbonamento = async (req, res) => {
  try {
    return res.status(201).json({ abbonamento: await abbonamenti.crea(req.userId, req.body) });
  } catch (error) {
    return gestisciErrore(res, error, 'Errore createAbbonamento', 'Errore nella creazione dell\'abbonamento');
  }
};

const updateAbbonamento = async (req, res) => {
  try {
    return res.json({ abbonamento: await abbonamenti.modifica(req.userId, req.params.id, req.body) });
  } catch (error) {
    return gestisciErrore(res, error, 'Errore updateAbbonamento', 'Errore nell\'aggiornamento dell\'abbonamento');
  }
};

const annullaAbbonamento = async (req, res) => {
  try {
    return res.json({ abbonamento: await abbonamenti.annulla(req.userId, req.params.id) });
  } catch (error) {
    return gestisciErrore(res, error, 'Errore annullaAbbonamento', 'Errore nell\'annullamento dell\'abbonamento');
  }
};

const escludiAbbonamento = async (req, res) => {
  try {
    return res.json({ abbonamento: await abbonamenti.escludi(req.userId, req.params.id) });
  } catch (error) {
    return gestisciErrore(res, error, 'Errore escludiAbbonamento', 'Errore nell\'esclusione dell\'abbonamento');
  }
};

const ripristinaAbbonamento = async (req, res) => {
  try {
    return res.json({ abbonamento: await abbonamenti.ripristina(req.userId, req.params.id) });
  } catch (error) {
    return gestisciErrore(res, error, 'Errore ripristinaAbbonamento', 'Errore nel ripristino dell\'abbonamento');
  }
};

module.exports = {
  getAbbonamenti,
  createAbbonamento,
  updateAbbonamento,
  annullaAbbonamento,
  escludiAbbonamento,
  ripristinaAbbonamento,
};
