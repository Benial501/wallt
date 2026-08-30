const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize, Movimento, Conto } = require('../models');
const CategoryLearningService = require('../services/import/CategoryLearningService');
const { MerchantAnalyzer, PersonalMerchantRulesService } = require('../services/merchant');

const toNumber = (val) => parseFloat(val) || 0;

/** Impatto sul saldo: entrata +importo, uscita -importo */
const deltaSaldo = (tipo, importo) => (tipo === 'entrata' ? toNumber(importo) : -toNumber(importo));

const MESI_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

const formatDataLabel = (dataStr) => {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const ieri = new Date(oggi);
  ieri.setDate(ieri.getDate() - 1);

  const data = new Date(dataStr + 'T12:00:00');
  data.setHours(0, 0, 0, 0);

  if (data.getTime() === oggi.getTime()) return 'Oggi';
  if (data.getTime() === ieri.getTime()) return 'Ieri';

  return `${data.getDate()} ${MESI_IT[data.getMonth()]} ${data.getFullYear()}`;
};

const getMovimenti = async (req, res) => {
  try {
    const {
      tipo, categoria, conto_id, da, a,
      page = 1, limit = 50,
      ordine,
      solo_conti_attivi: soloContiAttivi,
    } = req.query;

    const where = { user_id: req.userId };

    if (tipo) where.tipo = tipo;
    if (categoria) where.categoria = categoria;
    if (conto_id) where.conto_id = conto_id;
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const orderByCaricamento = ordine === 'caricamento';
    const contoInclude = {
      model: Conto,
      as: 'conto',
      attributes: ['id', 'nome', 'icona', 'colore', 'attivo'],
      ...(soloContiAttivi === 'true' ? { where: { attivo: true }, required: true } : {}),
    };

    const { count, rows } = await Movimento.findAndCountAll({
      where,
      include: [
        contoInclude,
        { model: Conto, as: 'contoDestinazione', attributes: ['id', 'nome', 'icona', 'colore'] },
      ],
      order: orderByCaricamento
        ? [['createdAt', 'DESC'], ['id', 'DESC']]
        : [['data', 'DESC'], ['id', 'DESC']],
      limit: limitNum,
      offset,
      distinct: soloContiAttivi === 'true',
    });

    const movimentiFlat = rows.map((mov) => ({
      ...mov.toJSON(),
      dataLabel: formatDataLabel(mov.data),
    }));

    const gruppi = {};
    rows.forEach((mov) => {
      const dataKey = mov.data;
      if (!gruppi[dataKey]) {
        gruppi[dataKey] = {
          data: dataKey,
          label: formatDataLabel(dataKey),
          movimenti: [],
          totale_entrate_giorno: 0,
          totale_uscite_giorno: 0,
        };
      }
      gruppi[dataKey].movimenti.push(mov);
      if (mov.tipo === 'entrata') {
        gruppi[dataKey].totale_entrate_giorno += toNumber(mov.importo);
      } else if (mov.tipo === 'uscita') {
        gruppi[dataKey].totale_uscite_giorno += toNumber(mov.importo);
      }
    });

    const risultato = Object.values(gruppi)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .map((g) => ({
        ...g,
        totale_entrate_giorno: Math.round(g.totale_entrate_giorno * 100) / 100,
        totale_uscite_giorno: Math.round(g.totale_uscite_giorno * 100) / 100,
      }));

    res.json({
      gruppi: risultato,
      movimenti: movimentiFlat,
      pagination: {
        page: pageNum,
        total: count,
        pages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    logger.error('Errore getMovimenti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei movimenti' });
  }
};

const createMovimento = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const {
      tipo, importo, categoria, conto_id, data,
      descrizione, ricorrente, ricorrente_frequenza, ricorrente_giorno,
    } = req.body;

    const importoNum = toNumber(importo);

    if (!['entrata', 'uscita'].includes(tipo)) {
      await t.rollback();
      return res.status(400).json({ message: 'Tipo deve essere entrata o uscita' });
    }

    if (importoNum <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Importo deve essere maggiore di zero' });
    }

    const conto = await Conto.findOne({
      where: { id: conto_id, user_id: req.userId, attivo: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!conto) {
      await t.rollback();
      return res.status(404).json({ error: 'Conto non trovato' });
    }

    if (tipo === 'uscita' && conto.tipo !== 'carta_credito') {
      if (toNumber(conto.saldo) < importoNum) {
        await t.rollback();
        return res.status(400).json({
          error: 'Saldo insufficiente',
          messaggio: `Saldo disponibile: €${toNumber(conto.saldo).toFixed(2)}. Importo richiesto: €${importoNum.toFixed(2)}.`,
          saldo_disponibile: conto.saldo,
          importo_richiesto: importo,
        });
      }
    }

    const movimento = await Movimento.create({
      user_id: req.userId,
      conto_id,
      tipo,
      importo: importoNum,
      categoria,
      descrizione,
      data,
      ricorrente: ricorrente || false,
      ricorrente_frequenza: ricorrente ? ricorrente_frequenza : null,
      ricorrente_giorno: ricorrente ? ricorrente_giorno : null,
    }, { transaction: t });

    const nuovoSaldo = tipo === 'entrata'
      ? toNumber(conto.saldo) + importoNum
      : toNumber(conto.saldo) - importoNum;

    await conto.update({ saldo: nuovoSaldo }, { transaction: t });
    await t.commit();

    res.status(201).json({ movimento, conto });
  } catch (error) {
    await t.rollback();
    return next(error);
  }
};

const updateMovimento = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const movimento = await Movimento.findOne({
      where: { id: req.params.id, user_id: req.userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!movimento) {
      await t.rollback();
      return res.status(404).json({ message: 'Movimento non trovato' });
    }

    if (movimento.tipo === 'trasferimento') {
      await t.rollback();
      return res.status(400).json({ message: 'I trasferimenti non possono essere modificati da qui' });
    }

    const contoVecchio = await Conto.findOne({
      where: { id: movimento.conto_id, user_id: req.userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!contoVecchio) {
      await t.rollback();
      return res.status(404).json({ message: 'Conto non trovato' });
    }

    const importoVecchio = toNumber(movimento.importo);
    const oldCategoria = movimento.categoria;
    const oldCategoriaDescrizione = movimento.descrizione;
    const oldCategoriaAutomatica = movimento.categoria_automatica;

    const {
      tipo, importo, categoria, conto_id, data,
      descrizione, ricorrente, ricorrente_frequenza, ricorrente_giorno,
    } = req.body;

    const nuovoTipo = tipo || movimento.tipo;
    const nuovoImporto = importo !== undefined ? toNumber(importo) : importoVecchio;
    const nuovoContoId = conto_id || movimento.conto_id;
    const nuovaCategoria = categoria !== undefined ? (categoria ?? movimento.categoria) : movimento.categoria;
    const categoriaCambiata = categoria !== undefined && nuovaCategoria !== oldCategoria;

    const contoNuovo = nuovoContoId === contoVecchio.id
      ? contoVecchio
      : await Conto.findOne({
        where: { id: nuovoContoId, user_id: req.userId, attivo: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

    if (!contoNuovo) {
      await t.rollback();
      return res.status(404).json({ message: 'Conto destinazione non trovato' });
    }

    if (nuovoImporto <= 0) {
      await t.rollback();
      return res.status(400).json({ message: 'Importo deve essere maggiore di zero' });
    }

    const stessoConto = contoNuovo.id === contoVecchio.id;
    const impattoVecchio = deltaSaldo(movimento.tipo, importoVecchio);
    const impattoNuovo = deltaSaldo(nuovoTipo, nuovoImporto);
    const erroreSaldoInsufficiente = {
      error: 'Saldo insufficiente',
      messaggio: 'Operazione annullata: saldo insufficiente sul conto.',
    };

    if (stessoConto) {
      if (contoNuovo.tipo !== 'carta_credito') {
        const saldoFinale = toNumber(contoNuovo.saldo) - impattoVecchio + impattoNuovo;
        if (saldoFinale < 0) {
          await t.rollback();
          return res.status(400).json(erroreSaldoInsufficiente);
        }
      }
    } else {
      if (contoVecchio.tipo !== 'carta_credito') {
        const saldoFinaleVecchio = toNumber(contoVecchio.saldo) - impattoVecchio;
        if (saldoFinaleVecchio < 0) {
          await t.rollback();
          return res.status(400).json(erroreSaldoInsufficiente);
        }
      }
      if (contoNuovo.tipo !== 'carta_credito') {
        const saldoFinaleNuovo = toNumber(contoNuovo.saldo) + impattoNuovo;
        if (saldoFinaleNuovo < 0) {
          await t.rollback();
          return res.status(400).json(erroreSaldoInsufficiente);
        }
      }
    }

    if (movimento.tipo === 'entrata') {
      await contoVecchio.update({ saldo: toNumber(contoVecchio.saldo) - importoVecchio }, { transaction: t });
    } else {
      await contoVecchio.update({ saldo: toNumber(contoVecchio.saldo) + importoVecchio }, { transaction: t });
    }

    await movimento.update({
      tipo: nuovoTipo,
      importo: nuovoImporto,
      categoria: nuovaCategoria,
      conto_id: nuovoContoId,
      data: data ?? movimento.data,
      descrizione: descrizione ?? movimento.descrizione,
      ricorrente: ricorrente ?? movimento.ricorrente,
      ricorrente_frequenza: ricorrente ? (ricorrente_frequenza ?? movimento.ricorrente_frequenza) : null,
      ricorrente_giorno: ricorrente ? (ricorrente_giorno ?? movimento.ricorrente_giorno) : null,
      categoria_automatica: categoriaCambiata ? false : (movimento.categoria_automatica ?? oldCategoriaAutomatica),
      categoria_modificata: categoriaCambiata ? true : (movimento.categoria_modificata ?? false),
    }, { transaction: t });

    // Apprendimento: se l'utente ha cambiato la categoria, creiamo regole personali.
    if (categoriaCambiata && nuovaCategoria) {
      const descrizioneFinale = descrizione !== undefined
        ? (descrizione ?? oldCategoriaDescrizione)
        : oldCategoriaDescrizione;

      const learningService = new CategoryLearningService();
      const personalRulesService = new PersonalMerchantRulesService();
      const merchantAnalyzer = new MerchantAnalyzer({ personalRulesService });

      try {
        await learningService.learnRule({
          userId: req.userId,
          descrizione: descrizioneFinale,
          categoria: nuovaCategoria,
          transaction: t,
        });
      } catch (e) {
        logger.warn('Learning rule failed', { err: e });
      }

      try {
        const merchantGuess = merchantAnalyzer.analyzeWithRules({
          descrizione: descrizioneFinale,
          tipo: nuovoTipo,
          personalRules: [],
        });

        await personalRulesService.learnRule({
          userId: req.userId,
          descrizione: descrizioneFinale,
          merchantName: merchantGuess.merchant,
          merchantId: merchantGuess.merchantId,
          categoria: nuovaCategoria,
          transaction: t,
        });
      } catch (e) {
        logger.warn('Personal merchant rule failed', { err: e });
      }
    }

    if (nuovoTipo === 'entrata') {
      await contoNuovo.update({ saldo: toNumber(contoNuovo.saldo) + nuovoImporto }, { transaction: t });
    } else {
      await contoNuovo.update({ saldo: toNumber(contoNuovo.saldo) - nuovoImporto }, { transaction: t });
    }

    await t.commit();
    await movimento.reload();
    await contoNuovo.reload();

    res.json({ movimento, conto: contoNuovo });
  } catch (error) {
    await t.rollback();
    logger.error('Errore updateMovimento', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento del movimento' });
  }
};

const deleteMovimento = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const movimento = await Movimento.findOne({
      where: { id: req.params.id, user_id: req.userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!movimento) {
      await t.rollback();
      return res.status(404).json({ message: 'Movimento non trovato' });
    }

    if (movimento.tipo === 'trasferimento') {
      const contoOrigine = await Conto.findOne({
        where: { id: movimento.conto_id, user_id: req.userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      const contoDest = await Conto.findOne({
        where: { id: movimento.conto_destinazione_id, user_id: req.userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (contoOrigine && contoDest) {
        const importoNum = toNumber(movimento.importo);
        await contoOrigine.update({ saldo: toNumber(contoOrigine.saldo) + importoNum }, { transaction: t });
        await contoDest.update({ saldo: toNumber(contoDest.saldo) - importoNum }, { transaction: t });
      }
    } else {
      const conto = await Conto.findOne({
        where: { id: movimento.conto_id, user_id: req.userId, attivo: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (conto) {
        const importoNum = toNumber(movimento.importo);
        if (movimento.tipo === 'entrata') {
          await conto.update({ saldo: toNumber(conto.saldo) - importoNum }, { transaction: t });
        } else {
          await conto.update({ saldo: toNumber(conto.saldo) + importoNum }, { transaction: t });
        }
      }
    }

    await movimento.destroy({ transaction: t });
    await t.commit();

    res.json({ message: 'Movimento eliminato' });
  } catch (error) {
    await t.rollback();
    logger.error('Errore deleteMovimento', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione del movimento' });
  }
};

const getBilancioMese = async (req, res) => {
  try {
    const now = new Date();
    const mese = parseInt(req.query.mese, 10) || (now.getMonth() + 1);
    const anno = parseInt(req.query.anno, 10) || now.getFullYear();

    const dataInizio = `${anno}-${String(mese).padStart(2, '0')}-01`;
    const ultimoGiorno = new Date(anno, mese, 0).getDate();
    const dataFine = `${anno}-${String(mese).padStart(2, '0')}-${ultimoGiorno}`;

    const movimenti = await Movimento.findAll({
      where: {
        user_id: req.userId,
        data: { [Op.between]: [dataInizio, dataFine] },
        tipo: { [Op.in]: ['entrata', 'uscita'] },
      },
    });

    let entrate = 0;
    let uscite = 0;
    const perCategoriaMap = {};

    movimenti.forEach((m) => {
      const importo = toNumber(m.importo);
      if (m.tipo === 'entrata') {
        entrate += importo;
      } else {
        uscite += importo;
        const cat = m.categoria || 'altro_uscita';
        perCategoriaMap[cat] = (perCategoriaMap[cat] || 0) + importo;
      }
    });

    const per_categoria = Object.entries(perCategoriaMap).map(([categoria, importo]) => ({
      categoria,
      importo: Math.round(importo * 100) / 100,
    }));

    res.json({
      entrate: Math.round(entrate * 100) / 100,
      uscite: Math.round(uscite * 100) / 100,
      saldo: Math.round((entrate - uscite) * 100) / 100,
      per_categoria,
      mese,
      anno,
    });
  } catch (error) {
    logger.error('Errore getBilancioMese', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo del bilancio' });
  }
};

const getRicorrenti = async (req, res) => {
  try {
    const movimenti = await Movimento.findAll({
      where: { user_id: req.userId, ricorrente: true },
      include: [
        { model: Conto, as: 'conto', attributes: ['id', 'nome', 'icona', 'colore'] },
      ],
      order: [['data', 'DESC']],
    });

    res.json({ movimenti });
  } catch (error) {
    logger.error('Errore getRicorrenti', { err: error });
    res.status(500).json({ message: 'Errore nel recupero dei movimenti ricorrenti' });
  }
};

module.exports = {
  getMovimenti,
  createMovimento,
  updateMovimento,
  deleteMovimento,
  getBilancioMese,
  getRicorrenti,
};
