const logger = require('../utils/logger');
const { Op } = require('sequelize');
const {
  sequelize, PiattaformaScommesse, MovimentoScommesse, Movimento, Conto,
} = require('../models');
const {
  ensureContoForPiattaforma,
  syncContoSaldoFromPiattaforma,
  syncContoFromPiattaformaMeta,
  deactivateLinkedConto,
  backfillUserLinks,
} = require('../services/scommesseContoSync.service');

const toNumber = (val) => parseFloat(val) || 0;

const calcolaStatsPiattaforma = async (piattaformaId) => {
  const movimenti = await MovimentoScommesse.findAll({
    where: { piattaforma_id: piattaformaId },
  });

  let totaleDepositato = 0;
  let totalePrelevato = 0;
  let totaleVincite = 0;
  let totalePerdite = 0;

  movimenti.forEach((m) => {
    const imp = toNumber(m.importo);
    if (m.tipo === 'deposito') totaleDepositato += imp;
    if (m.tipo === 'prelievo') totalePrelevato += imp;
    if (m.tipo === 'vincita') totaleVincite += imp;
    if (m.tipo === 'perdita') totalePerdite += imp;
  });

  const bilancioDisplay = totalePrelevato - totaleDepositato;
  const bilancioReale = (totalePrelevato + totaleVincite) - (totaleDepositato + totalePerdite);
  const roiPercentuale = totaleDepositato > 0
    ? Math.round((bilancioReale / totaleDepositato) * 10000) / 100
    : 0;

  return {
    totale_depositato: Math.round(totaleDepositato * 100) / 100,
    totale_prelevato: Math.round(totalePrelevato * 100) / 100,
    totale_vincite: Math.round(totaleVincite * 100) / 100,
    totale_perdite: Math.round(totalePerdite * 100) / 100,
    bilancio: Math.round(bilancioDisplay * 100) / 100,
    bilancio_display: Math.round(bilancioDisplay * 100) / 100,
    bilancio_reale: Math.round(bilancioReale * 100) / 100,
    roi_percentuale: roiPercentuale,
  };
};

const getPiattaforme = async (req, res) => {
  try {
    await backfillUserLinks(req.userId);

    const piattaforme = await PiattaformaScommesse.findAll({
      where: { user_id: req.userId, attiva: true },
      order: [['nome', 'ASC']],
    });

    const risultato = await Promise.all(
      piattaforme.map(async (p) => {
        const stats = await calcolaStatsPiattaforma(p.id);
        return { ...p.toJSON(), ...stats };
      })
    );

    res.json({ piattaforme: risultato });
  } catch (error) {
    logger.error('Errore getPiattaforme', { err: error });
    res.status(500).json({ message: 'Errore nel recupero delle piattaforme' });
  }
};

const createPiattaforma = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { nome, saldo_iniziale = 0, limite_mensile } = req.body;

    if (!nome) {
      await t.rollback();
      return res.status(400).json({ message: 'Nome obbligatorio' });
    }

    const piattaforma = await PiattaformaScommesse.create({
      user_id: req.userId,
      nome,
      saldo: toNumber(saldo_iniziale),
      limite_mensile: limite_mensile || null,
      attiva: true,
    }, { transaction: t });

    await ensureContoForPiattaforma(piattaforma, t);

    await t.commit();
    await piattaforma.reload();
    res.status(201).json({ piattaforma, conto_id: piattaforma.conto_id });
  } catch (error) {
    await t.rollback();
    logger.error('Errore createPiattaforma', { err: error });
    res.status(500).json({ message: 'Errore nella creazione della piattaforma' });
  }
};

const updatePiattaforma = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const piattaforma = await PiattaformaScommesse.findOne({
      where: { id: req.params.id, user_id: req.userId, attiva: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!piattaforma) {
      await t.rollback();
      return res.status(404).json({ message: 'Piattaforma non trovata' });
    }

    const { nome, limite_mensile } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (limite_mensile !== undefined) updateData.limite_mensile = limite_mensile;

    await piattaforma.update(updateData, { transaction: t });
    await syncContoFromPiattaformaMeta(piattaforma, updateData, t);

    await t.commit();
    res.json({ piattaforma });
  } catch (error) {
    await t.rollback();
    logger.error('Errore updatePiattaforma', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento della piattaforma' });
  }
};

const deletePiattaforma = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const piattaforma = await PiattaformaScommesse.findOne({
      where: { id: req.params.id, user_id: req.userId, attiva: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!piattaforma) {
      await t.rollback();
      return res.status(404).json({ message: 'Piattaforma non trovata' });
    }

    await piattaforma.update({ attiva: false, conto_id: null }, { transaction: t });
    await deactivateLinkedConto(piattaforma, t);

    await t.commit();
    res.json({ message: 'Piattaforma eliminata' });
  } catch (error) {
    await t.rollback();
    logger.error('Errore deletePiattaforma', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione della piattaforma' });
  }
};

const addMovimentoScommesse = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { piattaforma_id, tipo, importo, data, nota, conto_collegato_id } = req.body;
    const importoNum = toNumber(importo);

    if (!['deposito', 'prelievo', 'vincita', 'perdita'].includes(tipo)) {
      await t.rollback();
      return res.status(400).json({ message: 'Tipo non valido' });
    }

    if (importoNum <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Importo deve essere maggiore di zero' });
    }

    const piattaforma = await PiattaformaScommesse.findOne({
      where: { id: piattaforma_id, user_id: req.userId, attiva: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!piattaforma) {
      await t.rollback();
      return res.status(404).json({ message: 'Piattaforma non trovata' });
    }

    if ((tipo === 'prelievo' || tipo === 'perdita') && toNumber(piattaforma.saldo) < importoNum) {
      await t.rollback();
      return res.status(400).json({ message: 'Saldo piattaforma insufficiente' });
    }

    const dataMov = data || new Date().toISOString().split('T')[0];

    if (tipo === 'deposito' || tipo === 'vincita') {
      await piattaforma.update({ saldo: toNumber(piattaforma.saldo) + importoNum }, { transaction: t });
    } else {
      await piattaforma.update({ saldo: toNumber(piattaforma.saldo) - importoNum }, { transaction: t });
    }

    const movScommesse = await MovimentoScommesse.create({
      piattaforma_id,
      user_id: req.userId,
      tipo,
      importo: importoNum,
      data: dataMov,
      nota,
    }, { transaction: t });

    let conto = null;
    if (conto_collegato_id && (tipo === 'deposito' || tipo === 'prelievo')) {
      conto = await Conto.findOne({
        where: { id: conto_collegato_id, user_id: req.userId, attivo: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!conto) {
        await t.rollback();
        return res.status(404).json({ message: 'Conto non trovato' });
      }

      if (tipo === 'deposito' && toNumber(conto.saldo) < importoNum) {
        await t.rollback();
        return res.status(400).json({ message: 'Saldo conto insufficiente' });
      }

      const movTipo = tipo === 'deposito' ? 'uscita' : 'entrata';
      const categoria = tipo === 'deposito' ? 'deposito_scommesse' : 'prelievo_scommesse';
      const descrizione = tipo === 'deposito'
        ? `Deposito ${piattaforma.nome}`
        : `Prelievo ${piattaforma.nome}`;

      await Movimento.create({
        user_id: req.userId,
        conto_id: conto.id,
        tipo: movTipo,
        importo: importoNum,
        categoria,
        descrizione,
        data: dataMov,
        ricorrente: false,
      }, { transaction: t });

      const nuovoSaldo = tipo === 'deposito'
        ? toNumber(conto.saldo) - importoNum
        : toNumber(conto.saldo) + importoNum;
      await conto.update({ saldo: nuovoSaldo }, { transaction: t });
    }

    await t.commit();
    await piattaforma.reload();
    await syncContoSaldoFromPiattaforma(piattaforma);

    res.status(201).json({ movimento: movScommesse, piattaforma, conto });
  } catch (error) {
    await t.rollback();
    logger.error('Errore addMovimentoScommesse', { err: error });
    res.status(500).json({ message: 'Errore nel movimento scommesse' });
  }
};

const getMovimentiScommesse = async (req, res) => {
  try {
    const { piattaforma_id, da, a, tipo } = req.query;
    const where = { user_id: req.userId };

    if (piattaforma_id) where.piattaforma_id = piattaforma_id;
    if (tipo) where.tipo = tipo;
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const movimenti = await MovimentoScommesse.findAll({
      where,
      include: [{ model: PiattaformaScommesse, as: 'piattaforma', attributes: ['id', 'nome'] }],
      order: [['data', 'DESC'], ['id', 'DESC']],
      limit: 100,
    });

    res.json({ movimenti });
  } catch (error) {
    logger.error('Errore getMovimentiScommesse', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei movimenti' });
  }
};

const getPanoramica = async (req, res) => {
  try {
    const piattaforme = await PiattaformaScommesse.findAll({
      where: { user_id: req.userId, attiva: true },
    });

    const now = new Date();
    const mese = now.getMonth() + 1;
    const anno = now.getFullYear();
    const dataInizio = `${anno}-${String(mese).padStart(2, '0')}-01`;
    const ultimoGiorno = new Date(anno, mese, 0).getDate();
    const dataFine = `${anno}-${String(mese).padStart(2, '0')}-${ultimoGiorno}`;

    let totaleDepositato = 0;
    let totalePrelevato = 0;
    let totaleVincite = 0;
    let totalePerdite = 0;
    let depositiMese = 0;

    const perPiattaforma = await Promise.all(
      piattaforme.map(async (p) => {
        const stats = await calcolaStatsPiattaforma(p.id);

        const depositiMesePiatt = await MovimentoScommesse.sum('importo', {
          where: {
            piattaforma_id: p.id,
            tipo: 'deposito',
            data: { [Op.between]: [dataInizio, dataFine] },
          },
        }) || 0;

        depositiMese += toNumber(depositiMesePiatt);
        totaleDepositato += stats.totale_depositato;
        totalePrelevato += stats.totale_prelevato;
        totaleVincite += stats.totale_vincite;
        totalePerdite += stats.totale_perdite;

        const limite = toNumber(p.limite_mensile);
        const percentualeLimite = limite > 0
          ? Math.round((toNumber(depositiMesePiatt) / limite) * 10000) / 100
          : 0;

        return {
          id: p.id,
          nome: p.nome,
          saldo: toNumber(p.saldo),
          limite_mensile: limite,
          ...stats,
          depositi_mese: toNumber(depositiMesePiatt),
          percentuale_limite: percentualeLimite,
          vicino_limite: limite > 0 && percentualeLimite >= 80,
          limite_raggiunto: limite > 0 && toNumber(depositiMesePiatt) >= limite,
          importo_rimasto: limite > 0 ? Math.max(0, limite - toNumber(depositiMesePiatt)) : null,
        };
      })
    );

    const limiteTotale = piattaforme.reduce((s, p) => s + toNumber(p.limite_mensile), 0);
    const percentualeLimiteGlobale = limiteTotale > 0
      ? Math.round((depositiMese / limiteTotale) * 10000) / 100
      : 0;

    const bilancioReale = (totalePrelevato + totaleVincite) - (totaleDepositato + totalePerdite);

    res.json({
      totale_depositato: Math.round(totaleDepositato * 100) / 100,
      totale_prelevato: Math.round(totalePrelevato * 100) / 100,
      totale_vincite: Math.round(totaleVincite * 100) / 100,
      totale_perdite: Math.round(totalePerdite * 100) / 100,
      bilancio: Math.round((totalePrelevato - totaleDepositato) * 100) / 100,
      bilancio_netto: Math.round(bilancioReale * 100) / 100,
      depositi_mese: Math.round(depositiMese * 100) / 100,
      piattaforme: perPiattaforma,
      limite: {
        vicino_limite: limiteTotale > 0 && percentualeLimiteGlobale >= 80,
        limite_raggiunto: limiteTotale > 0 && depositiMese >= limiteTotale,
        percentuale_limite: percentualeLimiteGlobale,
        importo_rimasto: limiteTotale > 0 ? Math.max(0, limiteTotale - depositiMese) : null,
      },
    });
  } catch (error) {
    logger.error('Errore getPanoramica', { err: error });
    res.status(500).json({ message: 'Errore nel recupero della panoramica' });
  }
};

const getAnalisiScommesse = async (req, res) => {
  try {
    const { da, a, piattaforma_id } = req.query;
    const where = { user_id: req.userId };

    if (piattaforma_id) where.piattaforma_id = piattaforma_id;
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const movimenti = await MovimentoScommesse.findAll({
      where,
      include: [{ model: PiattaformaScommesse, as: 'piattaforma', attributes: ['id', 'nome'] }],
      order: [['data', 'ASC']],
    });

    let totaleDepositato = 0;
    let totalePrelevato = 0;
    let totaleVincite = 0;
    let totalePerdite = 0;
    const vincite = [];
    const perdite = [];

    movimenti.forEach((m) => {
      const imp = toNumber(m.importo);
      if (m.tipo === 'deposito') totaleDepositato += imp;
      if (m.tipo === 'prelievo') totalePrelevato += imp;
      if (m.tipo === 'vincita') {
        totaleVincite += imp;
        vincite.push(m);
      }
      if (m.tipo === 'perdita') {
        totalePerdite += imp;
        perdite.push(m);
      }
    });

    const numeroVincite = vincite.length;
    const numeroPerdite = perdite.length;
    const totaleOperazioni = numeroVincite + numeroPerdite;
    const percentualeVincite = totaleOperazioni > 0
      ? Math.round((numeroVincite / totaleOperazioni) * 10000) / 100
      : 0;

    const mediaVincita = numeroVincite > 0
      ? Math.round((totaleVincite / numeroVincite) * 100) / 100
      : 0;
    const mediaPerdita = numeroPerdite > 0
      ? Math.round((totalePerdite / numeroPerdite) * 100) / 100
      : 0;

    const sessioneMigliore = vincite.length
      ? vincite.reduce((best, m) => (toNumber(m.importo) > toNumber(best.importo) ? m : best))
      : null;
    const sessionePeggiore = perdite.length
      ? perdite.reduce((worst, m) => (toNumber(m.importo) > toNumber(worst.importo) ? m : worst))
      : null;

    const piattaforme = await PiattaformaScommesse.findAll({
      where: { user_id: req.userId, attiva: true },
    });

    const perPiattaforma = await Promise.all(
      piattaforme.map(async (p) => {
        const pWhere = { ...where, piattaforma_id: p.id };
        const movs = await MovimentoScommesse.findAll({ where: pWhere });
        let dep = 0; let prel = 0; let vinc = 0; let perd = 0;
        movs.forEach((m) => {
          const imp = toNumber(m.importo);
          if (m.tipo === 'deposito') dep += imp;
          if (m.tipo === 'prelievo') prel += imp;
          if (m.tipo === 'vincita') vinc += imp;
          if (m.tipo === 'perdita') perd += imp;
        });
        return {
          id: p.id,
          nome: p.nome,
          totale_depositato: dep,
          totale_prelevato: prel,
          totale_vincite: vinc,
          totale_perdite: perd,
          bilancio_netto: (prel + vinc) - (dep + perd),
        };
      })
    );

    res.json({
      periodo: { da: da || null, a: a || null },
      totale_depositato: Math.round(totaleDepositato * 100) / 100,
      totale_prelevato: Math.round(totalePrelevato * 100) / 100,
      totale_vincite: Math.round(totaleVincite * 100) / 100,
      totale_perdite: Math.round(totalePerdite * 100) / 100,
      bilancio_netto: Math.round(((totalePrelevato + totaleVincite) - (totaleDepositato + totalePerdite)) * 100) / 100,
      numero_vincite: numeroVincite,
      numero_perdite: numeroPerdite,
      percentuale_vincite: percentualeVincite,
      media_vincita: mediaVincita,
      media_perdita: mediaPerdita,
      sessione_migliore: sessioneMigliore
        ? { importo: toNumber(sessioneMigliore.importo), data: sessioneMigliore.data }
        : null,
      sessione_peggiore: sessionePeggiore
        ? { importo: toNumber(sessionePeggiore.importo), data: sessionePeggiore.data }
        : null,
      per_piattaforma: perPiattaforma,
    });
  } catch (error) {
    logger.error('Errore getAnalisiScommesse', { err: error });
    res.status(500).json({ message: 'Errore nell\'analisi scommesse' });
  }
};

module.exports = {
  getPiattaforme,
  createPiattaforma,
  updatePiattaforma,
  deletePiattaforma,
  addMovimentoScommesse,
  getMovimentiScommesse,
  getPanoramica,
  getAnalisiScommesse,
};
