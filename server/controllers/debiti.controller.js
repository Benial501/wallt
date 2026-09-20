const logger = require('../utils/logger');
const { Debito, Conto } = require('../models');

const getDebiti = async (req, res) => {
  try {
    const debiti = await Debito.findAll({
      where: { user_id: req.userId, attivo: true },
      order: [['createdAt', 'DESC']],
    });
    res.json({ debiti });
  } catch (error) {
    logger.error('Errore getDebiti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei debiti' });
  }
};

const findOwnedActiveConto = (contoId, userId) => Conto.findOne({
  where: { id: contoId, user_id: userId, attivo: true },
});

const createDebito = async (req, res) => {
  try {
    const {
      nome,
      tipo = 'altro',
      saldo_residuo,
      rata_periodica,
      tasso_interesse,
      taeg,
      frequenza = 'mensile',
      prossima_scadenza,
      data_fine,
      conto_id,
    } = req.body;

    if (conto_id !== undefined && conto_id !== null) {
      const conto = await findOwnedActiveConto(conto_id, req.userId);
      if (!conto) return res.status(404).json({ message: 'Conto non trovato' });
    }

    const debito = await Debito.create({
      user_id: req.userId,
      nome,
      tipo,
      saldo_residuo,
      rata_periodica: rata_periodica ?? null,
      tasso_interesse: tasso_interesse ?? null,
      taeg: taeg ?? null,
      frequenza,
      prossima_scadenza: prossima_scadenza ?? null,
      data_fine: data_fine ?? null,
      conto_id: conto_id ?? null,
      attivo: true,
    });

    return res.status(201).json({ debito });
  } catch (error) {
    logger.error('Errore createDebito', { err: error });
    return res.status(500).json({ message: 'Errore nella creazione del debito' });
  }
};

const updateDebito = async (req, res) => {
  try {
    const debito = await Debito.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });
    if (!debito) return res.status(404).json({ message: 'Debito non trovato' });

    const {
      nome,
      tipo,
      saldo_residuo,
      rata_periodica,
      tasso_interesse,
      taeg,
      frequenza,
      prossima_scadenza,
      data_fine,
      conto_id,
    } = req.body;

    if (conto_id !== undefined && conto_id !== null) {
      const conto = await findOwnedActiveConto(conto_id, req.userId);
      if (!conto) return res.status(404).json({ message: 'Conto non trovato' });
    }

    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (saldo_residuo !== undefined) updateData.saldo_residuo = saldo_residuo;
    if (rata_periodica !== undefined) updateData.rata_periodica = rata_periodica;
    if (tasso_interesse !== undefined) updateData.tasso_interesse = tasso_interesse;
    if (taeg !== undefined) updateData.taeg = taeg;
    if (frequenza !== undefined) updateData.frequenza = frequenza;
    if (prossima_scadenza !== undefined) updateData.prossima_scadenza = prossima_scadenza;
    if (data_fine !== undefined) updateData.data_fine = data_fine;
    if (conto_id !== undefined) updateData.conto_id = conto_id;

    await debito.update(updateData);
    return res.json({ debito });
  } catch (error) {
    logger.error('Errore updateDebito', { err: error });
    return res.status(500).json({ message: 'Errore nell\'aggiornamento del debito' });
  }
};

const deleteDebito = async (req, res) => {
  try {
    const debito = await Debito.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });
    if (!debito) return res.status(404).json({ message: 'Debito non trovato' });

    await debito.update({ attivo: false });
    return res.json({ message: 'Debito eliminato' });
  } catch (error) {
    logger.error('Errore deleteDebito', { err: error });
    return res.status(500).json({ message: 'Errore nell\'eliminazione del debito' });
  }
};

module.exports = {
  getDebiti,
  createDebito,
  updateDebito,
  deleteDebito,
};
