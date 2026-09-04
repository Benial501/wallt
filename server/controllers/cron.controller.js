const { processaRicorrenti } = require('../services/ricorrenti.service');

const processaMovimentiRicorrenti = async (_req, res, next) => {
  try {
    const result = await processaRicorrenti();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

module.exports = { processaMovimentiRicorrenti };
