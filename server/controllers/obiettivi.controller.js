const logger = require('../utils/logger');
const { Obiettivo, ObiettivoContributo } = require('../models');
const { calcolaProgressoObiettivo } = require('../services/obiettiviStato.service');

const toNumber = (val) => parseFloat(val) || 0;

const getObiettivi = async (req, res) => {
  try {
    const obiettivi = await Obiettivo.findAll({
      where: { user_id: req.userId },
      include: [{ model: ObiettivoContributo, as: 'contributi', separate: true, order: [['data', 'DESC']] }],
      order: [['createdAt', 'DESC']],
    });

    const conProgresso = obiettivi.map((o) => ({
      ...o.toJSON(), proiezione: calcolaProgressoObiettivo(o),
    }));
    const attivi = conProgresso.filter((o) => o.proiezione.stato !== 'completato');
    const completati = conProgresso.filter((o) => o.proiezione.stato === 'completato');

    res.json({ attivi, completati });
  } catch (error) {
    logger.error('Errore getObiettivi', { err: error });
    res.status(500).json({ message: 'Errore nel recupero degli obiettivi' });
  }
};

const createObiettivo = async (req, res) => {
  try {
    const {
      nome, importo_target, deadline, icona, importo_iniziale = 0, tipo_obiettivo = 'generico', priorita,
    } = req.body;

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
      tipo_obiettivo,
      priorita: priorita || null,
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

    const {
      nome, importo_target, deadline, icona, tipo_obiettivo, priorita,
    } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (importo_target !== undefined) updateData.importo_target = importo_target;
    if (deadline !== undefined) updateData.deadline = deadline;
    if (icona !== undefined) updateData.icona = icona;
    if (tipo_obiettivo !== undefined) updateData.tipo_obiettivo = tipo_obiettivo;
    if (priorita !== undefined) updateData.priorita = priorita;

    if (importo_target !== undefined) {
      updateData.completato = calcolaProgressoObiettivo({ ...obiettivo.toJSON(), ...updateData }).stato === 'completato';
    }
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

    const progresso = calcolaProgressoObiettivo(obiettivo);
    res.json({
      ...progresso,
      // Alias storici per la vista esistente. Nessuna previsione senza una
      // serie temporale mensile osservata: on_track rimane sconosciuto.
      mancante: progresso.importo_restante,
      rata_mensile_suggerita: progresso.contributo_mensile_richiesto,
      on_track: null,
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
