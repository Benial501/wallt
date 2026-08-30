const logger = require('../utils/logger');
const { Op } = require('sequelize');
const {
  sequelize, Investimento, MovimentoInvestimento, Movimento, Conto,
} = require('../models');

const toNumber = (val) => parseFloat(val) || 0;

const boolVal = (v) => v === true || v === 1 || v === '1';

const calcolaStatsInvestimento = async (investimentoId) => {
  const movimenti = await MovimentoInvestimento.findAll({
    where: { investimento_id: investimentoId },
  });

  let totaleVersato = 0;
  let totalePrelevato = 0;
  let totaleRendimenti = 0;
  let totalePerdite = 0;

  movimenti.forEach((m) => {
    const imp = toNumber(m.importo);
    if (m.tipo === 'versamento') totaleVersato += imp;
    if (m.tipo === 'prelievo') totalePrelevato += imp;
    if (m.tipo === 'rendimento') totaleRendimenti += imp;
    if (m.tipo === 'perdita') totalePerdite += imp;
  });

  const rendimentoNetto = totaleRendimenti - totalePerdite;
  const rendimentoPercentuale = totaleVersato > 0
    ? Math.round((rendimentoNetto / totaleVersato) * 10000) / 100
    : 0;

  return {
    totale_versato: Math.round(totaleVersato * 100) / 100,
    totale_prelevato: Math.round(totalePrelevato * 100) / 100,
    totale_rendimenti: Math.round(totaleRendimenti * 100) / 100,
    totale_perdite: Math.round(totalePerdite * 100) / 100,
    rendimento_netto: Math.round(rendimentoNetto * 100) / 100,
    rendimento_percentuale: rendimentoPercentuale,
  };
};

const getInvestimenti = async (req, res) => {
  try {
    const investimenti = await Investimento.findAll({
      where: { user_id: req.userId, attivo: true },
      order: [['nome_piattaforma', 'ASC']],
    });

    let patrimonioInvestitoTotale = 0;
    let rendimentoTotale = 0;
    let totaleVersatoGlobale = 0;

    const risultato = await Promise.all(
      investimenti.map(async (inv) => {
        const stats = await calcolaStatsInvestimento(inv.id);
        patrimonioInvestitoTotale += toNumber(inv.saldo_attuale);
        rendimentoTotale += stats.rendimento_netto;
        totaleVersatoGlobale += stats.totale_versato;
        return { ...inv.toJSON(), ...stats };
      })
    );

    const rendimentoTotalePercentuale = totaleVersatoGlobale > 0
      ? Math.round((rendimentoTotale / totaleVersatoGlobale) * 10000) / 100
      : 0;

    res.json({
      investimenti: risultato,
      patrimonio_investito_totale: Math.round(patrimonioInvestitoTotale * 100) / 100,
      rendimento_totale: Math.round(rendimentoTotale * 100) / 100,
      rendimento_totale_percentuale: rendimentoTotalePercentuale,
    });
  } catch (error) {
    logger.error('Errore getInvestimenti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero degli investimenti' });
  }
};

const createInvestimento = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      nome_piattaforma, tipo, saldo_iniziale = 0, colore, note,
    } = req.body;

    if (!nome_piattaforma || !tipo) {
      await t.rollback();
      return res.status(400).json({ message: 'Nome piattaforma e tipo obbligatori' });
    }

    const saldo = toNumber(saldo_iniziale);
    const oggi = new Date().toISOString().split('T')[0];

    const investimento = await Investimento.create({
      user_id: req.userId,
      nome_piattaforma,
      tipo,
      saldo_attuale: saldo,
      colore: colore || '#6C5CE7',
      note: note || null,
      attivo: true,
    }, { transaction: t });

    if (saldo > 0) {
      await MovimentoInvestimento.create({
        investimento_id: investimento.id,
        user_id: req.userId,
        tipo: 'versamento',
        importo: saldo,
        data: oggi,
        nota: 'Saldo iniziale',
        saldo_dopo: saldo,
      }, { transaction: t });
    }

    await t.commit();
    const stats = await calcolaStatsInvestimento(investimento.id);
    res.status(201).json({ investimento: { ...investimento.toJSON(), ...stats } });
  } catch (error) {
    await t.rollback();
    logger.error('Errore createInvestimento', { err: error });
    res.status(500).json({ message: 'Errore nella creazione dell\'investimento' });
  }
};

const updateInvestimento = async (req, res) => {
  try {
    const investimento = await Investimento.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });

    if (!investimento) {
      return res.status(404).json({ message: 'Investimento non trovato' });
    }

    const { nome_piattaforma, tipo, colore, note } = req.body;
    const updateData = {};
    if (nome_piattaforma !== undefined) updateData.nome_piattaforma = nome_piattaforma;
    if (tipo !== undefined) updateData.tipo = tipo;
    if (colore !== undefined) updateData.colore = colore;
    if (note !== undefined) updateData.note = note;

    await investimento.update(updateData);
    const stats = await calcolaStatsInvestimento(investimento.id);
    res.json({ investimento: { ...investimento.toJSON(), ...stats } });
  } catch (error) {
    logger.error('Errore updateInvestimento', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento dell\'investimento' });
  }
};

const deleteInvestimento = async (req, res) => {
  try {
    const investimento = await Investimento.findOne({
      where: { id: req.params.id, user_id: req.userId, attivo: true },
    });

    if (!investimento) {
      return res.status(404).json({ message: 'Investimento non trovato' });
    }

    await investimento.update({ attivo: false });
    res.json({ message: 'Investimento eliminato' });
  } catch (error) {
    logger.error('Errore deleteInvestimento', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione dell\'investimento' });
  }
};

const addMovimentoInvestimento = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const investimentoId = req.params.id;
    const {
      tipo, importo, data, nota, saldo_dopo, conto_collegato_id,
    } = req.body;
    const importoNum = toNumber(importo);

    if (!['versamento', 'prelievo', 'rendimento', 'perdita'].includes(tipo)) {
      await t.rollback();
      return res.status(400).json({ message: 'Tipo non valido' });
    }

    const investimento = await Investimento.findOne({
      where: { id: investimentoId, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!investimento) {
      await t.rollback();
      return res.status(404).json({ message: 'Investimento non trovato' });
    }

    const saldoPrecedente = toNumber(investimento.saldo_attuale);
    let nuovoSaldo = saldoPrecedente;
    let importoEffettivo = importoNum;

    if (saldo_dopo !== undefined && saldo_dopo !== null && saldo_dopo !== '') {
      nuovoSaldo = toNumber(saldo_dopo);
      const diff = nuovoSaldo - saldoPrecedente;
      importoEffettivo = Math.abs(diff);
      if (importoEffettivo === 0) {
        await t.rollback();
        return res.status(400).json({ message: 'Il saldo non è cambiato' });
      }
    } else if (importoNum <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Importo deve essere maggiore di zero' });
    } else if (tipo === 'versamento' || tipo === 'rendimento') {
      nuovoSaldo = saldoPrecedente + importoNum;
    } else {
      if (saldoPrecedente < importoNum) {
        await t.rollback();
        return res.status(400).json({ message: 'Saldo investimento insufficiente' });
      }
      nuovoSaldo = saldoPrecedente - importoNum;
    }

    let tipoEffettivo = tipo;
    if (saldo_dopo !== undefined && saldo_dopo !== null && saldo_dopo !== '') {
      const diff = nuovoSaldo - saldoPrecedente;
      if (diff > 0) tipoEffettivo = tipo === 'prelievo' ? 'rendimento' : (tipo === 'perdita' ? 'rendimento' : tipo);
      else if (diff < 0) tipoEffettivo = tipo === 'versamento' ? 'perdita' : (tipo === 'rendimento' ? 'perdita' : tipo);
      if (tipo === 'rendimento' || tipo === 'perdita') tipoEffettivo = tipo;
    }

    await investimento.update({ saldo_attuale: nuovoSaldo }, { transaction: t });

    const dataMov = data || new Date().toISOString().split('T')[0];

    const mov = await MovimentoInvestimento.create({
      investimento_id: investimento.id,
      user_id: req.userId,
      tipo: tipoEffettivo,
      importo: importoEffettivo,
      data: dataMov,
      nota,
      saldo_dopo: nuovoSaldo,
    }, { transaction: t });

    if (conto_collegato_id && (tipoEffettivo === 'versamento' || tipoEffettivo === 'prelievo')) {
      const conto = await Conto.findOne({
        where: { id: conto_collegato_id, user_id: req.userId, attivo: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!conto) {
        await t.rollback();
        return res.status(404).json({ message: 'Conto non trovato' });
      }

      if (tipoEffettivo === 'versamento' && toNumber(conto.saldo) < importoEffettivo) {
        await t.rollback();
        return res.status(400).json({ message: 'Saldo conto insufficiente' });
      }

      const movTipo = tipoEffettivo === 'versamento' ? 'uscita' : 'entrata';
      const categoria = tipoEffettivo === 'versamento' ? 'investimento' : 'rendimento_investimenti';
      const descrizione = tipoEffettivo === 'versamento'
        ? `Versamento ${investimento.nome_piattaforma}`
        : `Prelievo ${investimento.nome_piattaforma}`;

      await Movimento.create({
        user_id: req.userId,
        conto_id: conto.id,
        tipo: movTipo,
        importo: importoEffettivo,
        categoria,
        descrizione,
        data: dataMov,
        ricorrente: false,
      }, { transaction: t });

      const saldoConto = tipoEffettivo === 'versamento'
        ? toNumber(conto.saldo) - importoEffettivo
        : toNumber(conto.saldo) + importoEffettivo;
      await conto.update({ saldo: saldoConto }, { transaction: t });
    }

    await t.commit();
    await investimento.reload();
    const stats = await calcolaStatsInvestimento(investimento.id);

    res.status(201).json({
      movimento: mov,
      investimento: { ...investimento.toJSON(), ...stats },
    });
  } catch (error) {
    await t.rollback();
    logger.error('Errore addMovimentoInvestimento', { err: error });
    res.status(500).json({ message: 'Errore nel movimento investimento' });
  }
};

const getMovimentiInvestimento = async (req, res) => {
  try {
    const { da, a, tipo } = req.query;
    const where = {
      investimento_id: req.params.id,
      user_id: req.userId,
    };

    if (tipo) where.tipo = tipo;
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const movimenti = await MovimentoInvestimento.findAll({
      where,
      include: [{ model: Investimento, as: 'investimento', attributes: ['id', 'nome_piattaforma', 'colore'] }],
      order: [['data', 'DESC'], ['id', 'DESC']],
      limit: 200,
    });

    res.json({ movimenti });
  } catch (error) {
    logger.error('Errore getMovimentiInvestimento', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei movimenti' });
  }
};

const getAnalisiInvestimenti = async (req, res) => {
  try {
    const { da, a, investimento_id } = req.query;
    const where = { user_id: req.userId };

    if (investimento_id) where.investimento_id = investimento_id;
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const movimenti = await MovimentoInvestimento.findAll({
      where,
      include: [{ model: Investimento, as: 'investimento' }],
      order: [['data', 'ASC']],
    });

    let totaleVersato = 0;
    let totalePrelevato = 0;
    let totaleRendimenti = 0;
    let totalePerdite = 0;

    const mesiMap = {};

    movimenti.forEach((m) => {
      const imp = toNumber(m.importo);
      const d = new Date(m.data);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!mesiMap[key]) {
        mesiMap[key] = {
          mese: d.getMonth() + 1,
          anno: d.getFullYear(),
          versamenti: 0,
          prelievi: 0,
          rendimenti: 0,
          perdite: 0,
        };
      }

      if (m.tipo === 'versamento') { totaleVersato += imp; mesiMap[key].versamenti += imp; }
      if (m.tipo === 'prelievo') { totalePrelevato += imp; mesiMap[key].prelievi += imp; }
      if (m.tipo === 'rendimento') { totaleRendimenti += imp; mesiMap[key].rendimenti += imp; }
      if (m.tipo === 'perdita') { totalePerdite += imp; mesiMap[key].perdite += imp; }
    });

    const investimenti = await Investimento.findAll({
      where: { user_id: req.userId, attivo: true },
    });

    let patrimonioAttuale = 0;
    const perInvestimento = await Promise.all(
      investimenti.map(async (inv) => {
        const stats = await calcolaStatsInvestimento(inv.id);
        patrimonioAttuale += toNumber(inv.saldo_attuale);
        return {
          id: inv.id,
          nome_piattaforma: inv.nome_piattaforma,
          tipo: inv.tipo,
          colore: inv.colore,
          saldo_attuale: toNumber(inv.saldo_attuale),
          ...stats,
        };
      })
    );

    const rendimentoNetto = totaleRendimenti - totalePerdite;
    const rendimentoPercentuale = totaleVersato > 0
      ? Math.round((rendimentoNetto / totaleVersato) * 10000) / 100
      : 0;

    const andamentoMensile = Object.keys(mesiMap).sort().map((key) => {
      const m = mesiMap[key];
      return {
        ...m,
        saldo_totale: m.versamenti + m.rendimenti - m.prelievi - m.perdite,
      };
    });

    res.json({
      periodo: { da: da || null, a: a || null },
      patrimonio_attuale: Math.round(patrimonioAttuale * 100) / 100,
      totale_versato: Math.round(totaleVersato * 100) / 100,
      totale_prelevato: Math.round(totalePrelevato * 100) / 100,
      totale_rendimenti: Math.round(totaleRendimenti * 100) / 100,
      totale_perdite: Math.round(totalePerdite * 100) / 100,
      rendimento_netto: Math.round(rendimentoNetto * 100) / 100,
      rendimento_percentuale: rendimentoPercentuale,
      per_investimento: perInvestimento,
      andamento_mensile: andamentoMensile,
    });
  } catch (error) {
    logger.error('Errore getAnalisiInvestimenti', { err: error });
    res.status(500).json({ message: 'Errore nell\'analisi investimenti' });
  }
};

module.exports = {
  getInvestimenti,
  createInvestimento,
  updateInvestimento,
  deleteInvestimento,
  addMovimentoInvestimento,
  getMovimentiInvestimento,
  getAnalisiInvestimenti,
  boolVal,
};
