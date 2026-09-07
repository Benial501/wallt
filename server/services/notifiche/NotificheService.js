const { Op } = require('sequelize');
const { Notifica, PreferenzeNotifiche } = require('../../models');
const logger = require('../../utils/logger');
const {
  FUSO_DEFAULT,
  giornoLocale,
  prossimoIstanteConsentito,
} = require('./notificheTime');

/**
 * Cuore del sistema di notifiche: creazione con deduplica, limite giornaliero
 * e ore di silenzio, più le query del centro notifiche.
 *
 * Ogni funzione che legge o scrive notifiche richiede `userId` e lo applica
 * sempre nella `where`: non esiste un modo, da questo service, di toccare la
 * notifica di un altro utente.
 */

/** Priorità ammesse. Solo le urgenti possono occupare il secondo slot. */
const PRIORITA = { NORMALE: 'normale', URGENTE: 'urgente' };

const CANALE = { IN_APP: 'in_app', PUSH: 'push' };

/** Notifiche lette più vecchie di così vengono potate dal cron. */
const GIORNI_RITENZIONE = 90;

const clampMaxGiornaliere = (valore) => {
  const n = Number(valore);
  if (!Number.isFinite(n)) return 2;
  return Math.min(5, Math.max(1, Math.trunc(n)));
};

/**
 * Preferenze dell'utente, create con i default al primo utilizzo.
 * `findOrCreate` può perdere una gara con una richiesta parallela: in quel
 * caso l'unique su user_id fa fallire l'insert e rileggiamo la riga vincente.
 */
const getPreferenze = async (userId) => {
  try {
    const [preferenze] = await PreferenzeNotifiche.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId },
    });
    return preferenze;
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return PreferenzeNotifiche.findOne({ where: { user_id: userId } });
    }
    throw error;
  }
};

/** Quante notifiche "contate" pesano già sul giorno locale indicato. */
const contaNotificheGiorno = (userId, giorno) => Notifica.count({
  where: {
    user_id: userId,
    giorno_riferimento: giorno,
    conta_nel_limite: true,
  },
});

/**
 * Crea una notifica applicando tutte le regole anti-spam.
 *
 * Ritorna sempre un esito, senza lanciare per i casi previsti:
 *   - { creata: false, motivo: 'duplicata' }  → dedupe_key già presente
 *   - { creata: true, limitata: true }        → oltre il limite: resta solo
 *                                               nel centro notifiche, niente push
 *   - { creata: true, rinviata: true }        → cadeva nelle ore di silenzio
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.tipo
 * @param {string} params.dedupeKey  chiave univoca (userId + tipo + riferimento + periodo)
 * @param {string} params.titolo
 * @param {string} params.messaggio
 * @param {string} [params.link]     route della SPA da aprire
 * @param {string} [params.priorita] 'normale' | 'urgente'
 * @param {object} [params.metadata]
 * @param {object} [params.preferenze] preferenze già caricate (evita una query)
 * @param {Date}   [params.adesso]     istante di riferimento (iniettabile nei test)
 * @param {boolean} [params.saltaSeOltreLimite] true = non creare nulla se il
 *        limite è già saturo (usato dal promemoria giornaliero, che ha senso
 *        solo se consegnato nella sua giornata)
 */
const creaNotifica = async ({
  userId,
  tipo,
  dedupeKey,
  titolo,
  messaggio,
  link = null,
  priorita = PRIORITA.NORMALE,
  metadata = null,
  preferenze = null,
  adesso = new Date(),
  saltaSeOltreLimite = false,
}) => {
  const prefs = preferenze || await getPreferenze(userId);
  const timezone = prefs.timezone || FUSO_DEFAULT;

  // Ore di silenzio: la notifica non viene persa, viene programmata per il
  // primo orario consentito (di norma le 08:00 locali).
  const programmataPer = prossimoIstanteConsentito(adesso, prefs);
  const rinviata = programmataPer.getTime() !== adesso.getTime();
  const giorno = giornoLocale(programmataPer, timezone);

  const max = clampMaxGiornaliere(prefs.max_notifiche_giornaliere);
  // "Di norma una sola notifica al giorno": il secondo slot resta libero per
  // gli avvisi importanti (budget superato, pagamento imminente, sicurezza).
  const tetto = priorita === PRIORITA.URGENTE ? max : Math.min(1, max);
  const usate = await contaNotificheGiorno(userId, giorno);
  const oltreLimite = usate >= tetto;

  if (oltreLimite && saltaSeOltreLimite) {
    return { creata: false, motivo: 'limite_giornaliero' };
  }

  const contaNelLimite = !oltreLimite;
  // Il push parte solo se la notifica occupa uno slot reale e l'utente ha
  // dato il consenso. Senza consenso il centro notifiche funziona lo stesso.
  const canale = contaNelLimite && prefs.push_attive ? CANALE.PUSH : CANALE.IN_APP;

  try {
    const notifica = await Notifica.create({
      user_id: userId,
      tipo,
      titolo,
      messaggio,
      link,
      priorita,
      canale,
      dedupe_key: dedupeKey,
      programmata_per: programmataPer,
      giorno_riferimento: giorno,
      conta_nel_limite: contaNelLimite,
      metadata,
    });

    return {
      creata: true,
      notifica,
      limitata: oltreLimite,
      rinviata,
    };
  } catch (error) {
    // L'unique (user_id, dedupe_key) è la garanzia anti-duplicato: due
    // esecuzioni concorrenti del cron finiscono entrambe qui, non in doppioni.
    if (error?.name === 'SequelizeUniqueConstraintError') {
      return { creata: false, motivo: 'duplicata' };
    }
    throw error;
  }
};

/** Solo le notifiche già "dovute": quelle rinviate restano invisibili. */
const filtroConsegnate = (userId, extra = {}) => ({
  user_id: userId,
  programmata_per: { [Op.lte]: new Date() },
  ...extra,
});

const listNotifiche = async (userId, { soloNonLette = false, limit = 30, offset = 0 } = {}) => {
  const where = filtroConsegnate(userId, soloNonLette ? { letta: false } : {});

  const { count, rows } = await Notifica.findAndCountAll({
    where,
    order: [['programmata_per', 'DESC'], ['id', 'DESC']],
    limit: Math.min(Math.max(Number(limit) || 30, 1), 100),
    offset: Math.max(Number(offset) || 0, 0),
    attributes: { exclude: ['dedupe_key'] },
  });

  return { totale: count, notifiche: rows };
};

const contaNonLette = (userId) => Notifica.count({
  where: filtroConsegnate(userId, { letta: false }),
});

/** @returns {boolean} false se la notifica non esiste o non è dell'utente. */
const segnaLetta = async (userId, notificaId) => {
  const [aggiornate] = await Notifica.update(
    { letta: true, letta_at: new Date() },
    { where: { id: notificaId, user_id: userId, letta: false } },
  );

  if (aggiornate > 0) return true;

  // Già letta: è comunque un successo per il client, ma solo se la notifica
  // appartiene davvero a questo utente.
  const esistente = await Notifica.findOne({
    where: { id: notificaId, user_id: userId },
    attributes: ['id'],
  });
  return !!esistente;
};

const segnaTutteLette = async (userId) => {
  const [aggiornate] = await Notifica.update(
    { letta: true, letta_at: new Date() },
    { where: filtroConsegnate(userId, { letta: false }) },
  );
  return aggiornate;
};

/**
 * Marca il giorno locale corrente come "già controllato": il promemoria
 * giornaliero non verrà più generato per quella data.
 */
const segnaGiornataControllata = async (userId, adesso = new Date()) => {
  const prefs = await getPreferenze(userId);
  const giorno = giornoLocale(adesso, prefs.timezone);
  await prefs.update({ giornata_controllata_il: giorno });
  return giorno;
};

/** Potatura delle notifiche lette più vecchie della finestra di ritenzione. */
const potaNotificheVecchie = async (adesso = new Date()) => {
  const limite = new Date(adesso.getTime() - GIORNI_RITENZIONE * 86400000);
  const eliminate = await Notifica.destroy({
    where: {
      letta: true,
      programmata_per: { [Op.lt]: limite },
    },
  });
  if (eliminate > 0) {
    logger.info('Notifiche vecchie eliminate', { eliminate });
  }
  return eliminate;
};

module.exports = {
  PRIORITA,
  CANALE,
  GIORNI_RITENZIONE,
  clampMaxGiornaliere,
  getPreferenze,
  contaNotificheGiorno,
  creaNotifica,
  listNotifiche,
  contaNonLette,
  segnaLetta,
  segnaTutteLette,
  segnaGiornataControllata,
  potaNotificheVecchie,
};
