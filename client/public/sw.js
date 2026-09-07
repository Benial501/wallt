/* eslint-disable no-restricted-globals */
/**
 * Service worker di WALLT — solo notifiche push.
 *
 * Non fa caching né intercetta le richieste di rete: l'app resta una SPA
 * servita normalmente. L'unico compito è mostrare le notifiche push e portare
 * l'utente sulla pagina giusta al clic.
 *
 * PRIVACY: il payload che arriva qui è volutamente generico (nessun importo,
 * nessun saldo, nessun nome di conto). I dati veri si vedono solo dentro
 * l'app, dopo l'autenticazione.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const leggiPayload = (event) => {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { corpo: event.data.text() };
  }
};

self.addEventListener('push', (event) => {
  const dati = leggiPayload(event);
  const titolo = dati.titolo || 'WALLT';
  const opzioni = {
    body: dati.corpo || 'Hai un nuovo avviso finanziario.',
    icon: '/icon-192x192.png',
    badge: '/favicon-32x32.png',
    // Con lo stesso tag una notifica sostituisce la precedente dello stesso
    // tipo, invece di impilarsi.
    tag: dati.tag || 'wallt-notifica',
    renotify: false,
    data: { url: dati.url || '/notifiche', notificaId: dati.notificaId || null },
  };

  event.waitUntil(self.registration.showNotification(titolo, opzioni));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinazione = event.notification.data?.url || '/notifiche';

  event.waitUntil((async () => {
    const finestre = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Se WALLT è già aperta si riusa quella scheda invece di aprirne una nuova.
    for (const finestra of finestre) {
      if (new URL(finestra.url).origin === self.location.origin) {
        await finestra.focus();
        if ('navigate' in finestra) {
          try {
            await finestra.navigate(destinazione);
          } catch {
            // Alcuni browser rifiutano navigate() su schede non controllate:
            // la scheda resta comunque a fuoco.
          }
        }
        return;
      }
    }

    await self.clients.openWindow(destinazione);
  })());
});
