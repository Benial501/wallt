const logger = require('../utils/logger');
const { sequelize, Conto } = require('../models');
const {
  TIPO_CONTO_FONDO,
  MESI_TARGET_DEFAULT,
  NOME_DEFAULT,
  trovaContoFondo,
  descriviFondo,
} = require('../services/fondoEmergenza.service');

/**
 * Il fondo di emergenza: un conto separato, fuori dai soldi spendibili, in cui
 * mettere da parte una riserva per gli imprevisti.
 *
 * Nessuna di queste rotte muove denaro. Per versare o prelevare si usa il
 * trasferimento interno già esistente (POST /api/conti/trasferimento), che
 * aggiorna i saldi di entrambi i conti in transazione: duplicare qui quella
 * logica violerebbe la Coding Rule 6 e sarebbe il posto più facile in cui
 * sbagliare un saldo.
 */

/** Lo stato del fondo. Risponde 200 anche quando il fondo non esiste
 * (`esiste: false`): la card in home ha bisogno di sapere che non c'è, non di
 * un 404 da gestire come errore. */
const getFondo = async (req, res) => {
  try {
    res.json(await descriviFondo(req.userId));
  } catch (error) {
    logger.error('Errore getFondo', { err: error });
    res.status(500).json({ message: 'Errore nel recupero del fondo di emergenza' });
  }
};

/** Crea il conto del fondo, vuoto. `nascosto: true` e `saldo: 0` non sono
 * negoziabili dal chiamante: il fondo nasce fuori dai soldi spendibili, e i
 * soldi vi entrano solo con un trasferimento. */
const createFondo = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const esistente = await trovaContoFondo(req.userId, { transaction: t });
    if (esistente) {
      await t.rollback();
      return res.status(409).json({
        message: 'Hai già un fondo di emergenza',
        conto_id: esistente.id,
      });
    }

    const nome = req.body.nome ? String(req.body.nome).trim() : NOME_DEFAULT;
    const mesiTarget = req.body.mesi_target ?? MESI_TARGET_DEFAULT;

    const conto = await Conto.create({
      user_id: req.userId,
      nome,
      tipo: TIPO_CONTO_FONDO,
      saldo: 0,
      nascosto: true,
      mesi_sicurezza_target: mesiTarget,
    }, { transaction: t });

    await t.commit();
    logger.info('Fondo di emergenza creato', { userId: req.userId, contoId: conto.id, mesiTarget });
    return res.status(201).json(await descriviFondo(req.userId));
  } catch (error) {
    await t.rollback();
    // L'indice parziale conti_un_solo_fondo_emergenza è la garanzia vera
    // dell'unicità: due richieste contemporanee superano entrambe il controllo
    // qui sopra, e una delle due arriva qui.
    if (error.name === 'SequelizeUniqueConstraintError') {
      const esistente = await trovaContoFondo(req.userId);
      return res.status(409).json({
        message: 'Hai già un fondo di emergenza',
        conto_id: esistente ? esistente.id : null,
      });
    }
    logger.error('Errore createFondo', { err: error });
    return res.status(500).json({ message: 'Errore nella creazione del fondo di emergenza' });
  }
};

/** Cambia la soglia in mesi (e il nome). Il saldo non si tocca da qui. */
const updateFondo = async (req, res) => {
  try {
    const conto = await trovaContoFondo(req.userId);
    if (!conto) return res.status(404).json({ message: 'Non hai un fondo di emergenza' });

    const updateData = {};
    if (req.body.mesi_target !== undefined && req.body.mesi_target !== null) {
      updateData.mesi_sicurezza_target = req.body.mesi_target;
    }
    if (req.body.nome !== undefined && req.body.nome !== null) {
      updateData.nome = String(req.body.nome).trim();
    }
    if (Object.keys(updateData).length) await conto.update(updateData);

    return res.json(await descriviFondo(req.userId));
  } catch (error) {
    logger.error('Errore updateFondo', { err: error });
    return res.status(500).json({ message: 'Errore nell\'aggiornamento del fondo di emergenza' });
  }
};

module.exports = { getFondo, createFondo, updateFondo };
