/**
 * Attivazione delle notifiche push del browser.
 *
 * Il permesso viene chiesto SOLO su azione esplicita dell'utente (mai
 * all'avvio dell'app): un prompt non richiesto è la via più rapida perché il
 * browser blocchi le notifiche per sempre.
 *
 * Ogni funzione qui è difensiva: su browser senza service worker o senza
 * Push API il centro notifiche in-app continua a funzionare normalmente.
 */

const PERCORSO_SERVICE_WORKER = '/sw.js';

/** Il browser supporta le push? (Safari iOS solo se installata come PWA) */
export const pushSupportate = () => (
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

/** 'default' | 'granted' | 'denied' | 'non_supportato' */
export const statoPermesso = () => {
  if (!pushSupportate()) return 'non_supportato';
  return Notification.permission;
};

/** La chiave VAPID viaggia in base64url e va convertita in Uint8Array. */
export const base64UrlToUint8Array = (base64Url) => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

export const registraServiceWorker = async () => {
  if (!pushSupportate()) return null;
  return navigator.serviceWorker.register(PERCORSO_SERVICE_WORKER);
};

/**
 * Chiede il permesso e crea la sottoscrizione push.
 *
 * @returns {Promise<{ok: boolean, motivo?: string, subscription?: object}>}
 */
export const attivaPush = async (chiavePubblica) => {
  if (!pushSupportate()) {
    return { ok: false, motivo: 'non_supportato' };
  }
  if (!chiavePubblica) {
    return { ok: false, motivo: 'chiave_mancante' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, motivo: 'permesso_negato' };
  }

  const permesso = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permesso !== 'granted') {
    return { ok: false, motivo: permesso === 'denied' ? 'permesso_negato' : 'permesso_rifiutato' };
  }

  try {
    const registration = await registraServiceWorker();
    await navigator.serviceWorker.ready;

    // Una sottoscrizione già presente può essere legata a una chiave VAPID
    // vecchia: in quel caso va rifatta, altrimenti l'invio fallirebbe.
    const esistente = await registration.pushManager.getSubscription();
    if (esistente) await esistente.unsubscribe();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(chiavePubblica),
    });

    return { ok: true, subscription: subscription.toJSON() };
  } catch (error) {
    return { ok: false, motivo: 'errore_sottoscrizione', dettaglio: error?.message };
  }
};

/** Rimuove la sottoscrizione dal browser. @returns {Promise<string|null>} endpoint rimosso */
export const disattivaPush = async () => {
  if (!pushSupportate()) return null;

  try {
    const registration = await navigator.serviceWorker.getRegistration(PERCORSO_SERVICE_WORKER);
    if (!registration) return null;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return null;

    const { endpoint } = subscription;
    await subscription.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
};

export const MESSAGGI_PUSH = {
  non_supportato: 'Questo browser non supporta le notifiche push. Il centro notifiche resta disponibile.',
  permesso_negato: 'Hai bloccato le notifiche per WALLT. Sbloccale dalle impostazioni del browser (icona del lucchetto accanto all\'indirizzo) e riprova.',
  permesso_rifiutato: 'Permesso non concesso: le notifiche push restano disattivate.',
  chiave_mancante: 'Le notifiche push non sono configurate su questo server.',
  errore_sottoscrizione: 'Non è stato possibile attivare le notifiche push. Riprova più tardi.',
};
