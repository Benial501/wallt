const { Op } = require('sequelize');
const webpush = require('web-push');
const { Notifica, PushSubscription, PreferenzeNotifiche } = require('../../models');
const logger = require('../../utils/logger');

/**
 * Web Push (VAPID).
 *
 * Il push è un livello OPZIONALE: se le chiavi VAPID non sono configurate, o
 * se l'utente non ha dato il consenso, tutto il resto del sistema continua a
 * funzionare e le notifiche restano nel centro notifiche in-app.
 *
 * PRIVACY — il payload che esce da qui finisce in una notifica di sistema,
 * visibile sulla lockscreen senza autenticazione. Non contiene mai importi,
 * saldi, nomi di conti o descrizioni di movimenti: solo un titolo, una frase
 * generica e la route da aprire dentro WALLT. I dettagli si leggono in app,
 * dopo il login.
 */

const TESTI_PUSH_GENERICI = {
  promemoria_giornaliero: 'Non hai ancora registrato movimenti oggi.',
  budget_80: 'Una categoria del tuo budget sta per esaurirsi.',
  budget_superato: 'Una categoria del tuo budget è stata superata.',
  ricorrente_imminente: 'Domani è previsto un pagamento ricorrente.',
  obiettivo_traguardo: 'Hai raggiunto un traguardo di risparmio.',
  obiettivo_raggiunto: 'Hai raggiunto un obiettivo di risparmio.',
  riepilogo_settimanale: 'Il riepilogo della tua settimana è pronto.',
  sicurezza: 'Controlla la sicurezza del tuo account.',
};

const TESTO_PUSH_FALLBACK = 'Hai un nuovo avviso finanziario. Apri WALLT per i dettagli.';

let configurato = false;
let motivoNonConfigurato = 'Chiavi VAPID non configurate';

const chiavePubblica = () => (process.env.VAPID_PUBLIC_KEY || '').trim();

/**
 * Configura VAPID una sola volta per processo. Non lancia: registra il motivo
 * e lascia il sistema in modalità solo-in-app.
 */
const initPush = () => {
  if (configurato) return { ok: true };

  const pubblica = chiavePubblica();
  const privata = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim();

  if (!pubblica || !privata) {
    motivoNonConfigurato = 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non impostate';
    return { ok: false, motivo: motivoNonConfigurato };
  }
  if (!/^(mailto:|https:)/.test(subject)) {
    motivoNonConfigurato = 'VAPID_SUBJECT deve essere un mailto: o un URL https:';
    return { ok: false, motivo: motivoNonConfigurato };
  }

  try {
    webpush.setVapidDetails(subject, pubblica, privata);
    configurato = true;
    return { ok: true };
  } catch (error) {
    motivoNonConfigurato = error.message;
    logger.error('[push] Configurazione VAPID non valida', { err: error });
    return { ok: false, motivo: motivoNonConfigurato };
  }
};

const isPushDisponibile = () => initPush().ok;

/** Chiave pubblica VAPID: è pubblica per definizione, la usa il browser. */
const getChiavePubblica = () => (isPushDisponibile() ? chiavePubblica() : null);

/**
 * Registra (o riassegna) una sottoscrizione del browser.
 * Lo stesso endpoint può cambiare proprietario se sul dispositivo accede un
 * altro account: in quel caso la riga viene riassegnata, non duplicata.
 */
const salvaSubscription = async (userId, subscription, userAgent = null) => {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return { ok: false, motivo: 'subscription_incompleta' };
  }

  const esistente = await PushSubscription.findOne({ where: { endpoint } });
  if (esistente) {
    await esistente.update({
      user_id: userId,
      p256dh,
      auth,
      user_agent: userAgent ? String(userAgent).slice(0, 255) : esistente.user_agent,
      attiva: true,
      ultimo_errore: null,
      disattivata_at: null,
    });
    return { ok: true, subscription: esistente };
  }

  const creata = await PushSubscription.create({
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent ? String(userAgent).slice(0, 255) : null,
    attiva: true,
  });
  return { ok: true, subscription: creata };
};

/** Rimuove una sottoscrizione dell'utente (o tutte, se `endpoint` è assente). */
const rimuoviSubscription = async (userId, endpoint = null) => {
  const where = endpoint ? { user_id: userId, endpoint } : { user_id: userId };
  return PushSubscription.destroy({ where });
};

const disattivaSubscription = async (subscription, motivo) => {
  await subscription.update({
    attiva: false,
    ultimo_errore: String(motivo || '').slice(0, 255),
    disattivata_at: new Date(),
  });
  logger.info('[push] Sottoscrizione disattivata', {
    userId: subscription.user_id,
    subscriptionId: subscription.id,
  });
};

/** Payload volutamente generico: nessun dato finanziario fuori dall'app. */
const payloadPerNotifica = (notifica) => JSON.stringify({
  titolo: notifica.titolo,
  corpo: TESTI_PUSH_GENERICI[notifica.tipo] || TESTO_PUSH_FALLBACK,
  url: notifica.link || '/notifiche',
  tag: `wallt-${notifica.tipo}`,
  notificaId: notifica.id,
});

/**
 * Invia una notifica a tutte le sottoscrizioni attive dell'utente.
 * Il fallimento di una singola sottoscrizione non interrompe le altre né il
 * job: 404/410 disattivano la sottoscrizione, gli altri errori vengono solo
 * registrati.
 *
 * @returns {{inviate: number, disattivate: number, fallite: number}}
 */
const inviaANotificaSubscriptions = async (notifica, subscriptions) => {
  const esito = { inviate: 0, disattivate: 0, fallite: 0 };
  const payload = payloadPerNotifica(notifica);

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, payload, { TTL: 6 * 3600 });
      esito.inviate += 1;
    } catch (error) {
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        // Sottoscrizione non più valida: il browser l'ha revocata.
        await disattivaSubscription(sub, `HTTP ${status}`);
        esito.disattivate += 1;
      } else {
        esito.fallite += 1;
        logger.warn('[push] Invio fallito', {
          userId: sub.user_id,
          subscriptionId: sub.id,
          status,
        });
      }
    }
  }

  return esito;
};

/**
 * Spedisce le notifiche in attesa di push: quelle con canale `push`, già
 * dovute (`programmata_per <= adesso`) e mai inviate.
 *
 * @param {object} [opzioni]
 * @param {number} [opzioni.userId] limita a un singolo utente
 * @param {Date}   [opzioni.adesso]
 */
const inviaNotifichePendenti = async ({ userId = null, adesso = new Date() } = {}) => {
  const riepilogo = {
    notifiche: 0, inviate: 0, disattivate: 0, fallite: 0, senza_subscription: 0,
  };

  if (!isPushDisponibile()) {
    logger.info('[push] Invio saltato: push non configurato', { motivo: motivoNonConfigurato });
    return riepilogo;
  }

  const pendenti = await Notifica.findAll({
    where: {
      canale: 'push',
      push_inviata_at: null,
      programmata_per: { [Op.lte]: adesso },
      // Non rincorriamo notifiche vecchie: se il cron è rimasto fermo giorni,
      // un push su un avviso scaduto è solo rumore.
      createdAt: { [Op.gte]: new Date(adesso.getTime() - 2 * 86400000) },
      ...(userId ? { user_id: userId } : {}),
    },
    order: [['programmata_per', 'ASC']],
    limit: 500,
  });

  for (const notifica of pendenti) {
    riepilogo.notifiche += 1;

    // Il consenso viene riletto al momento dell'invio: se l'utente ha spento
    // le push dopo la creazione della notifica, non parte nulla.
    const prefs = await PreferenzeNotifiche.findOne({ where: { user_id: notifica.user_id } });
    if (!prefs || !prefs.push_attive) {
      await notifica.update({ canale: 'in_app' });
      riepilogo.senza_subscription += 1;
      continue;
    }

    const subscriptions = await PushSubscription.findAll({
      where: { user_id: notifica.user_id, attiva: true },
    });

    if (subscriptions.length === 0) {
      // Niente da spedire: la notifica resta nel centro notifiche e non
      // viene ritentata all'infinito.
      await notifica.update({ canale: 'in_app' });
      riepilogo.senza_subscription += 1;
      continue;
    }

    const esito = await inviaANotificaSubscriptions(notifica, subscriptions);
    riepilogo.inviate += esito.inviate;
    riepilogo.disattivate += esito.disattivate;
    riepilogo.fallite += esito.fallite;

    if (esito.inviate > 0) {
      await notifica.update({ push_inviata_at: new Date() });
    } else {
      // Nessun destinatario valido rimasto: si degrada a sola consultazione.
      await notifica.update({ canale: 'in_app' });
    }
  }

  return riepilogo;
};

module.exports = {
  TESTI_PUSH_GENERICI,
  TESTO_PUSH_FALLBACK,
  initPush,
  isPushDisponibile,
  getChiavePubblica,
  salvaSubscription,
  rimuoviSubscription,
  payloadPerNotifica,
  inviaNotifichePendenti,
};
