const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize, Conto, Movimento, Investimento } = require('../models');
const {
  ensurePiattaformaForConto,
  syncPiattaformaFromContoMeta,
  deactivateLinkedPiattaforma,
  backfillUserLinks,
} = require('../services/scommesseContoSync.service');

const toNumber = (val) => parseFloat(val) || 0;

const normalizeContoTipo = (tipo) => {
  if (tipo === 'wallet_digitale') return 'wallet';
  return tipo;
};

const normalizeContoNome = (nome) => String(nome || '').trim();

const findInactiveContoByNome = async (userId, nome, transaction) => {
  const normalized = normalizeContoNome(nome).toLowerCase();
  if (!normalized) return null;

  const inattivi = await Conto.findAll({
    where: { user_id: userId, attivo: false },
    transaction,
  });

  return inattivi.find((c) => normalizeContoNome(c.nome).toLowerCase() === normalized) || null;
};

const getConti = async (req, res) => {
  try {
    await backfillUserLinks(req.userId);

    const conti = await Conto.findAll({
      where: { user_id: req.userId, attivo: true },
      order: [['ordine', 'ASC'], ['id', 'ASC']],
    });

    const patrimonio_conti = conti.reduce((sum, c) => sum + toNumber(c.saldo), 0);

    const investimenti = await Investimento.findAll({
      where: { user_id: req.userId, attivo: true },
    });
    const patrimonio_investimenti = investimenti.reduce((sum, i) => sum + toNumber(i.saldo_attuale), 0);
    const patrimonio_totale = patrimonio_conti + patrimonio_investimenti;

    res.json({
      conti,
      patrimonio_totale: Math.round(patrimonio_totale * 100) / 100,
      patrimonio_conti: Math.round(patrimonio_conti * 100) / 100,
      patrimonio_investimenti: Math.round(patrimonio_investimenti * 100) / 100,
    });
  } catch (error) {
    logger.error('Errore getConti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei conti' });
  }
};

const createConto = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { nome, tipo: tipoRaw, saldo_iniziale = 0, icona, colore } = req.body;
    const nomeNorm = normalizeContoNome(nome);
    const tipo = normalizeContoTipo(tipoRaw);

    if (!nomeNorm || !tipo) {
      await t.rollback();
      return res.status(400).json({ message: 'Nome e tipo sono obbligatori' });
    }

    const maxOrdine = await Conto.max('ordine', {
      where: { user_id: req.userId },
      transaction: t,
    });

    const saldo = toNumber(saldo_iniziale);
    const oggi = new Date().toISOString().split('T')[0];

    const inattivo = await findInactiveContoByNome(req.userId, nomeNorm, t);
    if (inattivo) {
      const saldoPrecedente = toNumber(inattivo.saldo);
      await inattivo.update({
        attivo: true,
        nome: nomeNorm,
        tipo,
        icona: icona || inattivo.icona || '💳',
        colore: colore || inattivo.colore || '#00D4AA',
        ordine: (maxOrdine || 0) + 1,
        ...(saldo > 0 && saldoPrecedente === 0 ? { saldo } : {}),
      }, { transaction: t });

      if (saldo > 0 && saldoPrecedente === 0) {
        await Movimento.create({
          user_id: req.userId,
          conto_id: inattivo.id,
          tipo: 'entrata',
          importo: saldo,
          categoria: 'altro_entrata',
          descrizione: 'Saldo iniziale',
          data: oggi,
          ricorrente: false,
        }, { transaction: t });
      }

      if (tipo === 'scommesse') {
        await ensurePiattaformaForConto(inattivo, t);
      }

      await t.commit();
      return res.status(201).json({ conto: inattivo, reactivated: true });
    }

    const conto = await Conto.create({
      user_id: req.userId,
      nome: nomeNorm,
      tipo,
      saldo,
      icona: icona || '💳',
      colore: colore || '#00D4AA',
      ordine: (maxOrdine || 0) + 1,
      attivo: true,
    }, { transaction: t });

    if (saldo > 0) {
      await Movimento.create({
        user_id: req.userId,
        conto_id: conto.id,
        tipo: 'entrata',
        importo: saldo,
        categoria: 'altro_entrata',
        descrizione: 'Saldo iniziale',
        data: oggi,
        ricorrente: false,
      }, { transaction: t });
    }

    if (tipo === 'scommesse') {
      await ensurePiattaformaForConto(conto, t);
    }

    await t.commit();
    res.status(201).json({ conto });
  } catch (error) {
    await t.rollback();
    return next(error);
  }
};

const updateConto = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const conto = await Conto.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!conto) {
      await t.rollback();
      return res.status(404).json({ message: 'Conto non trovato' });
    }

    const { nome, icona, colore, ordine } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (icona !== undefined) updateData.icona = icona;
    if (colore !== undefined) updateData.colore = colore;
    if (ordine !== undefined) updateData.ordine = ordine;

    await conto.update(updateData, { transaction: t });
    await syncPiattaformaFromContoMeta(conto, updateData, t);

    await t.commit();
    res.json({ conto });
  } catch (error) {
    await t.rollback();
    logger.error('Errore updateConto', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento del conto' });
  }
};

const deleteConto = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const conto = await Conto.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!conto) {
      await t.rollback();
      return res.status(404).json({ message: 'Conto non trovato' });
    }

    await conto.update({ attivo: false }, { transaction: t });
    await deactivateLinkedPiattaforma(conto, t);

    await t.commit();
    res.json({ message: 'Conto eliminato', conto });
  } catch (error) {
    await t.rollback();
    logger.error('Errore deleteConto', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione del conto' });
  }
};

const getPatrimonioTotale = async (req, res) => {
  try {
    const conti = await Conto.findAll({
      where: { user_id: req.userId, attivo: true },
    });

    const totaleConti = conti.reduce((sum, c) => sum + toNumber(c.saldo), 0);

    const investimenti = await Investimento.findAll({
      where: { user_id: req.userId, attivo: true },
    });
    const totaleInvestimenti = investimenti.reduce((sum, i) => sum + toNumber(i.saldo_attuale), 0);
    const totale = totaleConti + totaleInvestimenti;

    const now = new Date();
    const primoGiorno = new Date(now.getFullYear(), now.getMonth(), 1);
    const dataInizio = primoGiorno.toISOString().split('T')[0];

    const movimentiMese = await Movimento.findAll({
      where: {
        user_id: req.userId,
        data: { [Op.gte]: dataInizio },
        tipo: { [Op.in]: ['entrata', 'uscita'] },
      },
    });

    let deltaMese = 0;
    movimentiMese.forEach((m) => {
      if (m.tipo === 'entrata') deltaMese += toNumber(m.importo);
      else if (m.tipo === 'uscita') deltaMese -= toNumber(m.importo);
    });

    const totaleInizioMese = totale - deltaMese;
    const variazione_importo = Math.round((totale - totaleInizioMese) * 100) / 100;
    const variazione_percentuale = totaleInizioMese !== 0
      ? Math.round((variazione_importo / Math.abs(totaleInizioMese)) * 10000) / 100
      : (totale > 0 ? 100 : 0);

    res.json({
      totale: Math.round(totale * 100) / 100,
      totale_conti: Math.round(totaleConti * 100) / 100,
      totale_investimenti: Math.round(totaleInvestimenti * 100) / 100,
      variazione_importo,
      variazione_percentuale,
    });
  } catch (error) {
    logger.error('Errore getPatrimonioTotale', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo del patrimonio' });
  }
};

const trasferimento = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { conto_origine_id, conto_destinazione_id, importo, nota, data } = req.body;
    const importoNum = toNumber(importo);

    if (!conto_origine_id || !conto_destinazione_id || !importoNum || !data) {
      await t.rollback();
      return res.status(400).json({ message: 'Campi obbligatori mancanti' });
    }

    if (conto_origine_id === conto_destinazione_id) {
      await t.rollback();
      return res.status(400).json({ message: 'I conti origine e destinazione devono essere diversi' });
    }

    const contoOrigine = await Conto.findOne({
      where: { id: conto_origine_id, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const contoDestinazione = await Conto.findOne({
      where: { id: conto_destinazione_id, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!contoOrigine || !contoDestinazione) {
      await t.rollback();
      return res.status(404).json({ message: 'Uno o entrambi i conti non trovati' });
    }

    if (toNumber(contoOrigine.saldo) < importoNum) {
      await t.rollback();
      return res.status(400).json({
        error: 'Saldo insufficiente',
        messaggio: `Saldo disponibile sul conto "${contoOrigine.nome}": €${toNumber(contoOrigine.saldo).toFixed(2)}`,
        saldo_disponibile: contoOrigine.saldo,
      });
    }

    await contoOrigine.update({ saldo: toNumber(contoOrigine.saldo) - importoNum }, { transaction: t });
    await contoDestinazione.update({ saldo: toNumber(contoDestinazione.saldo) + importoNum }, { transaction: t });

    if (contoOrigine.tipo === 'scommesse') {
      await syncPiattaformaFromContoMeta(contoOrigine, {
        saldo: toNumber(contoOrigine.saldo) - importoNum,
      }, t);
    }
    if (contoDestinazione.tipo === 'scommesse') {
      await syncPiattaformaFromContoMeta(contoDestinazione, {
        saldo: toNumber(contoDestinazione.saldo) + importoNum,
      }, t);
    }

    await Movimento.create({
      user_id: req.userId,
      conto_id: conto_origine_id,
      conto_destinazione_id: conto_destinazione_id,
      tipo: 'trasferimento',
      importo: importoNum,
      categoria: 'trasferimento',
      descrizione: nota || 'Trasferimento',
      data,
      ricorrente: false,
    }, { transaction: t });

    await t.commit();

    await contoOrigine.reload();
    await contoDestinazione.reload();

    res.json({
      success: true,
      conto_origine: contoOrigine,
      conto_destinazione: contoDestinazione,
    });
  } catch (error) {
    await t.rollback();
    logger.error('Errore trasferimento', { err: error });
    res.status(500).json({ message: 'Errore durante il trasferimento' });
  }
};

module.exports = {
  getConti,
  createConto,
  updateConto,
  deleteConto,
  getPatrimonioTotale,
  trasferimento,
};
