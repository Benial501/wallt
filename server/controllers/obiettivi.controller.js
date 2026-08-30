const logger = require('../utils/logger');
const { Obiettivo, ObiettivoContributo } = require('../models');

const toNumber = (val) => parseFloat(val) || 0;

const getObiettivi = async (req, res) => {
  try {
    const obiettivi = await Obiettivo.findAll({
      where: { user_id: req.userId },
      include: [{ model: ObiettivoContributo, as: 'contributi', separate: true, order: [['data', 'DESC']] }],
      order: [['createdAt', 'DESC']],
    });

    const attivi = obiettivi.filter((o) => !o.completato);
    const completati = obiettivi.filter((o) => o.completato);

    res.json({ attivi, completati });
  } catch (error) {
    logger.error('Errore getObiettivi', { err: error });
    res.status(500).json({ message: 'Errore nel recupero degli obiettivi' });
  }
};

const createObiettivo = async (req, res) => {
  try {
    const { nome, importo_target, deadline, icona, importo_iniziale = 0 } = req.body;

    if (!nome || !importo_target) {
      return res.status(400).json({ message: 'Nome e importo target sono obbligatori' });
    }

    const iniziale = toNumber(importo_iniziale);
    const obiettivo = await Obiettivo.create({
      user_id: req.userId,
      nome,
      importo_target,
      importo_attuale: iniziale,
      deadline: deadline || null,
      icona: icona || '🎯',
      completato: iniziale >= toNumber(importo_target),
    });

    if (iniziale > 0) {
      await ObiettivoContributo.create({
        obiettivo_id: obiettivo.id,
        importo: iniziale,
        data: new Date().toISOString().split('T')[0],
        nota: 'Importo iniziale',
      });
    }

    res.status(201).json({ obiettivo });
  } catch (error) {
    logger.error('Errore createObiettivo', { err: error });
    res.status(500).json({ message: 'Errore nella creazione dell\'obiettivo' });
  }
};

const updateObiettivo = async (req, res) => {
  try {
    const obiettivo = await Obiettivo.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });

    if (!obiettivo) {
      return res.status(404).json({ message: 'Obiettivo non trovato' });
    }

    const { nome, importo_target, deadline, icona } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (importo_target !== undefined) updateData.importo_target = importo_target;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (icona !== undefined) updateData.icona = icona;

    await obiettivo.update(updateData);
    res.json({ obiettivo });
  } catch (error) {
    logger.error('Errore updateObiettivo', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento dell\'obiettivo' });
  }
};

const deleteObiettivo = async (req, res) => {
  try {
    const obiettivo = await Obiettivo.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });

    if (!obiettivo) {
      return res.status(404).json({ message: 'Obiettivo non trovato' });
    }

    await ObiettivoContributo.destroy({ where: { obiettivo_id: obiettivo.id } });
    await obiettivo.destroy();

    res.json({ message: 'Obiettivo eliminato' });
  } catch (error) {
    logger.error('Errore deleteObiettivo', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione dell\'obiettivo' });
  }
};

const addContributo = async (req, res) => {
  try {
    const { importo, data, nota } = req.body;
    const importoNum = toNumber(importo);

    if (importoNum <= 0) {
      return res.status(400).json({ message: 'Importo deve essere maggiore di zero' });
    }

    const obiettivo = await Obiettivo.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });

    if (!obiettivo) {
      return res.status(404).json({ message: 'Obiettivo non trovato' });
    }

    await ObiettivoContributo.create({
      obiettivo_id: obiettivo.id,
      importo: importoNum,
      data: data || new Date().toISOString().split('T')[0],
      nota,
    });

    const nuovoAttuale = toNumber(obiettivo.importo_attuale) + importoNum;
    const appenaCompletato = !obiettivo.completato && nuovoAttuale >= toNumber(obiettivo.importo_target);

    await obiettivo.update({
      importo_attuale: nuovoAttuale,
      completato: nuovoAttuale >= toNumber(obiettivo.importo_target),
    });

    await obiettivo.reload({
      include: [{ model: ObiettivoContributo, as: 'contributi' }],
    });

    res.json({ obiettivo, appena_completato: appenaCompletato });
  } catch (error) {
    logger.error('Errore addContributo', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiunta del contributo' });
  }
};

const getProiezione = async (req, res) => {
  try {
    const obiettivo = await Obiettivo.findOne({
      where: { id: req.params.id, user_id: req.userId },
      include: [{ model: ObiettivoContributo, as: 'contributi' }],
    });

    if (!obiettivo) {
      return res.status(404).json({ message: 'Obiettivo non trovato' });
    }

    const mancante = Math.max(0, toNumber(obiettivo.importo_target) - toNumber(obiettivo.importo_attuale));
    let mesiRimanenti = null;
    let rataMensile = null;
    let onTrack = true;

    if (obiettivo.deadline && mancante > 0) {
      const now = new Date();
      const deadline = new Date(obiettivo.deadline);
      mesiRimanenti = Math.max(1, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24 * 30)));
      rataMensile = Math.round((mancante / mesiRimanenti) * 100) / 100;

      const contributi = obiettivo.contributi || [];
      if (contributi.length >= 2) {
        const sorted = [...contributi].sort((a, b) => new Date(a.data) - new Date(b.data));
        const first = new Date(sorted[0].data);
        const last = new Date(sorted[sorted.length - 1].data);
        const mesiPassati = Math.max(1, (last - first) / (1000 * 60 * 60 * 24 * 30));
        const mediaMensile = toNumber(obiettivo.importo_attuale) / mesiPassati;
        onTrack = mediaMensile >= rataMensile * 0.8;
      }
    } else if (mancante > 0) {
      const contributi = obiettivo.contributi || [];
      if (contributi.length > 0) {
        const totaleContributi = contributi.reduce((s, c) => s + toNumber(c.importo), 0);
        rataMensile = Math.round((totaleContributi / contributi.length) * 100) / 100;
      }
    }

    res.json({
      mancante,
      mesi_rimanenti: mesiRimanenti,
      rata_mensile_suggerita: rataMensile,
      on_track: onTrack,
    });
  } catch (error) {
    logger.error('Errore getProiezione', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo della proiezione' });
  }
};

module.exports = {
  getObiettivi,
  createObiettivo,
  updateObiettivo,
  deleteObiettivo,
  addContributo,
  getProiezione,
};
