const logger = require('../utils/logger');
const NotificheService = require('../services/notifiche/NotificheService');
const PushService = require('../services/notifiche/PushService');
const { generaPerUtente } = require('../services/notifiche/NotificheGenerator');

/**
 * API del centro notifiche.
 *
 * Ogni handler lavora esclusivamente su `req.userId` (impostato da
 * authMiddleware): non esiste un parametro che permetta di indicare un utente
 * diverso, e le query passano sempre dal service, che filtra per user_id.
 */

/** Campi delle preferenze modificabili dal client. */
const CAMPI_PREFERENZE_BOOLEANI = [
  'promemoria_giornaliero_attivo',
  'alert_budget_attivi',
  'alert_ricorrenti_attivi',
  'alert_obiettivi_attivi',
  'riepilogo_settimanale_attivo',
];

const formatPreferenze = (preferenze) => ({
  promemoria_giornaliero_attivo: preferenze.promemoria_giornaliero_attivo,
  alert_budget_attivi: preferenze.alert_budget_attivi,
  alert_ricorrenti_attivi: preferenze.alert_ricorrenti_attivi,
  alert_obiettivi_attivi: preferenze.alert_obiettivi_attivi,
  riepilogo_settimanale_attivo: preferenze.riepilogo_settimanale_attivo,
  push_attive: preferenze.push_attive,
  orario_promemoria: preferenze.orario_promemoria,
  timezone: preferenze.timezone,
  quiet_hours_inizio: preferenze.quiet_hours_inizio,
  quiet_hours_fine: preferenze.quiet_hours_fine,
  max_notifiche_giornaliere: preferenze.max_notifiche_giornaliere,
  giornata_controllata_il: preferenze.giornata_controllata_il,
  push_disponibile: PushService.isPushDisponibile(),
});

const getNotifiche = async (req, res) => {
  try {
    const { non_lette: nonLette, limit, offset } = req.query;
    const risultato = await NotificheService.listNotifiche(req.userId, {
      soloNonLette: nonLette === 'true',
      limit,
      offset,
    });

    res.json({
      notifiche: risultato.notifiche,
      totale: risultato.totale,
      non_lette: await NotificheService.contaNonLette(req.userId),
    });
  } catch (error) {
    logger.error('Errore getNotifiche', { err: error });
    res.status(500).json({ message: 'Errore nel recupero delle notifiche' });
  }
};

/** Endpoint leggero per il badge della campanella. */
const getNonLette = async (req, res) => {
  try {
    const risultato = await NotificheService.listNotifiche(req.userId, {
      soloNonLette: true,
      limit: 20,
    });
    res.json({ non_lette: risultato.totale, notifiche: risultato.notifiche });
  } catch (error) {
    logger.error('Errore getNonLette', { err: error });
    res.status(500).json({ message: 'Errore nel recupero delle notifiche' });
  }
};

const segnaLetta = async (req, res) => {
  try {
    const trovata = await NotificheService.segnaLetta(req.userId, req.params.id);
    if (!trovata) {
      // Stessa risposta sia per "non esiste" sia per "è di un altro utente":
      // non si conferma l'esistenza di ID altrui.
      return res.status(404).json({ message: 'Notifica non trovata' });
    }

    res.json({
      message: 'Notifica letta',
      non_lette: await NotificheService.contaNonLette(req.userId),
    });
  } catch (error) {
    logger.error('Errore segnaLetta', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento della notifica' });
  }
};

const segnaTutteLette = async (req, res) => {
  try {
    const aggiornate = await NotificheService.segnaTutteLette(req.userId);
    res.json({ message: 'Notifiche segnate come lette', aggiornate, non_lette: 0 });
  } catch (error) {
    logger.error('Errore segnaTutteLette', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento delle notifiche' });
  }
};

const getPreferenze = async (req, res) => {
  try {
    const preferenze = await NotificheService.getPreferenze(req.userId);
    res.json({
      preferenze: formatPreferenze(preferenze),
      chiave_pubblica_push: PushService.getChiavePubblica(),
    });
  } catch (error) {
    logger.error('Errore getPreferenzeNotifiche', { err: error });
    res.status(500).json({ message: 'Errore nel recupero delle preferenze' });
  }
};

const updatePreferenze = async (req, res) => {
  try {
    const preferenze = await NotificheService.getPreferenze(req.userId);
    const aggiornamento = {};

    CAMPI_PREFERENZE_BOOLEANI.forEach((campo) => {
      if (req.body[campo] !== undefined) aggiornamento[campo] = !!req.body[campo];
    });

    ['orario_promemoria', 'quiet_hours_inizio', 'quiet_hours_fine', 'timezone'].forEach((campo) => {
      if (req.body[campo] !== undefined) aggiornamento[campo] = req.body[campo];
    });

    if (req.body.max_notifiche_giornaliere !== undefined) {
      aggiornamento.max_notifiche_giornaliere = NotificheService
        .clampMaxGiornaliere(req.body.max_notifiche_giornaliere);
    }

    // Le push non si attivano da qui a piacere: senza una sottoscrizione
    // registrata dal browser l'attivazione non avrebbe alcun effetto.
    if (req.body.push_attive === true) {
      if (!PushService.isPushDisponibile()) {
        return res.status(503).json({
          message: 'Le notifiche push non sono configurate su questo server.',
        });
      }
      aggiornamento.push_attive = true;
    } else if (req.body.push_attive === false) {
      aggiornamento.push_attive = false;
      await PushService.rimuoviSubscription(req.userId);
    }

    await preferenze.update(aggiornamento);

    res.json({
      preferenze: formatPreferenze(preferenze),
      message: 'Preferenze notifiche aggiornate',
    });
  } catch (error) {
    logger.error('Errore updatePreferenzeNotifiche', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento delle preferenze' });
  }
};

const registraPush = async (req, res) => {
  try {
    if (!PushService.isPushDisponibile()) {
      return res.status(503).json({
        message: 'Le notifiche push non sono configurate su questo server.',
      });
    }

    const esito = await PushService.salvaSubscription(
      req.userId,
      req.body?.subscription || req.body,
      req.get('user-agent'),
    );

    if (!esito.ok) {
      return res.status(400).json({ message: 'Sottoscrizione push non valida' });
    }

    // La registrazione della sottoscrizione È il consenso esplicito: arriva
    // solo dopo che il browser ha concesso il permesso all'utente.
    const preferenze = await NotificheService.getPreferenze(req.userId);
    await preferenze.update({ push_attive: true });

    res.status(201).json({
      message: 'Notifiche push attivate',
      preferenze: formatPreferenze(preferenze),
    });
  } catch (error) {
    logger.error('Errore registraPush', { err: error });
    res.status(500).json({ message: 'Errore nella registrazione delle notifiche push' });
  }
};

const rimuoviPush = async (req, res) => {
  try {
    const endpoint = req.body?.endpoint || null;
    const rimosse = await PushService.rimuoviSubscription(req.userId, endpoint);

    // Nessun dispositivo registrato: il consenso non ha più oggetto.
    const preferenze = await NotificheService.getPreferenze(req.userId);
    if (!endpoint) {
      await preferenze.update({ push_attive: false });
    }

    res.json({
      message: 'Notifiche push disattivate',
      rimosse,
      preferenze: formatPreferenze(preferenze),
    });
  } catch (error) {
    logger.error('Errore rimuoviPush', { err: error });
    res.status(500).json({ message: 'Errore nella disattivazione delle notifiche push' });
  }
};

/** L'utente dichiara di aver già controllato la giornata: niente promemoria. */
const segnaGiornataControllata = async (req, res) => {
  try {
    const giorno = await NotificheService.segnaGiornataControllata(req.userId);
    res.json({ message: 'Giornata segnata come controllata', giorno });
  } catch (error) {
    logger.error('Errore segnaGiornataControllata', { err: error });
    res.status(500).json({ message: 'Errore nel salvataggio' });
  }
};

/**
 * Rigenerazione on-demand per il solo utente autenticato (usata dalla UI
 * dopo modifiche a budget/obiettivi). È idempotente per costruzione: le
 * dedupe key impediscono qualunque duplicato.
 */
const generaNotifiche = async (req, res) => {
  try {
    const esito = await generaPerUtente({ userId: req.userId });
    res.json({ esito, non_lette: await NotificheService.contaNonLette(req.userId) });
  } catch (error) {
    logger.error('Errore generaNotifiche', { err: error });
    res.status(500).json({ message: 'Errore nella generazione delle notifiche' });
  }
};

module.exports = {
  formatPreferenze,
  getNotifiche,
  getNonLette,
  segnaLetta,
  segnaTutteLette,
  getPreferenze,
  updatePreferenze,
  registraPush,
  rimuoviPush,
  segnaGiornataControllata,
  generaNotifiche,
};
