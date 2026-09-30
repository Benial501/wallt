/**
 * Monitoraggio degli errori (Sentry) e analytics (Vercel).
 *
 * Due regole che valgono per tutto il file:
 *
 * 1. **Niente denaro fuori da WALLT.** Un report d'errore e' un canale verso
 *    l'esterno esattamente come la notifica push, e la Regola 17 ci dice gia'
 *    cosa puo' uscire: mai importi, saldi o categorie. Qui la regola e' piu'
 *    scomoda da rispettare, perche' un importo non arriva solo dai campi che
 *    scegliamo noi — entra dal testo di un messaggio d'errore, dall'etichetta
 *    del pulsante che l'utente ha premuto, dalla query string di una chiamata.
 *    Per questo `rimuoviDatiFinanziari` non filtra un elenco di campi: passa
 *    su tutte le stringhe dell'evento.
 *
 * 2. **Senza chiavi l'app funziona identica.** Come per VAPID e OpenAI, se la
 *    configurazione non c'e' il modulo non fa nulla e non rompe niente: in
 *    sviluppo non si inizializza proprio, cosi' gli errori restano in console
 *    dove servono.
 */

/**
 * Numeri che sembrano denaro: "1250,50", "1.250,50 €", "€1250.50", "-89,90",
 * "12,00 EUR", e gli interi accompagnati da un simbolo ("€ 1250").
 *
 * I confini `(?<!\d)` / `(?!\d)` non sono un dettaglio: senza quello iniziale
 * "1250,50" veniva agganciato a partire da "250,50" e il report usciva con
 * "1[rimosso]" — la prima cifra dell'importo restava a schermo.
 */
const SOMIGLIA_A_IMPORTO = new RegExp(
  [
    // importo con decimali, con o senza separatore delle migliaia
    '-?\\s*[€$£]?\\s*(?<!\\d)(?:\\d{1,3}(?:[.\\s]\\d{3})+|\\d+)[.,]\\d{2}(?!\\d)\\s*(?:[€$£]|EUR|USD|GBP)?',
    // intero accompagnato da un simbolo di valuta, prima o dopo
    '-?\\s*[€$£]\\s*(?<!\\d)\\d+(?!\\d)',
    '-?\\s*(?<!\\d)\\d+(?!\\d)\\s*(?:[€$£]|EUR|USD|GBP)\\b',
  ].join('|'),
  'gi',
);

/** Chiavi il cui valore e' sempre da togliere, quale che sia la forma. */
const CHIAVI_SENSIBILI = new Set([
  'importo', 'importo_attuale', 'importo_target', 'saldo', 'saldo_residuo',
  'saldo_disponibile', 'saldo_effettivo', 'patrimonio', 'patrimonio_totale',
  'descrizione', 'nota', 'entrata_mensile', 'costo_abitazione', 'stima_bollette',
  'spesa_benzina', 'spesa_mezzi', 'spese_fisse_extra', 'categoria',
  'email', 'password', 'token', 'access_token', 'step_up_token',
]);

const OSCURATO = '[rimosso]';

const ripulisciTesto = (testo) => testo.replace(SOMIGLIA_A_IMPORTO, OSCURATO);

/**
 * Cammina l'evento e ripulisce ogni stringa. Esportata per poterla provare:
 * e' l'unica garanzia che un saldo non finisca su un server altrui, e una
 * garanzia che nessuno verifica non e' una garanzia.
 */
export const rimuoviDatiFinanziari = (valore, chiave = null, profondita = 0) => {
  if (profondita > 12) return valore;

  if (chiave !== null && CHIAVI_SENSIBILI.has(String(chiave).toLowerCase())) {
    return OSCURATO;
  }
  if (typeof valore === 'string') return ripulisciTesto(valore);
  if (Array.isArray(valore)) {
    return valore.map((v) => rimuoviDatiFinanziari(v, null, profondita + 1));
  }
  if (valore && typeof valore === 'object') {
    const pulito = {};
    for (const [k, v] of Object.entries(valore)) {
      pulito[k] = rimuoviDatiFinanziari(v, k, profondita + 1);
    }
    return pulito;
  }
  return valore;
};

/** Toglie la query string: i filtri dei movimenti ci passano importi e date. */
export const ripulisciUrl = (url) => {
  if (typeof url !== 'string') return url;
  const taglio = url.search(/[?#]/);
  return taglio === -1 ? url : `${url.slice(0, taglio)}?[rimossa]`;
};

/* ------------------------------------------------------------------------ */
/* Sentry                                                                     */
/* ------------------------------------------------------------------------ */

const dsn = import.meta.env?.VITE_SENTRY_DSN?.trim();

/** Vero solo quando il monitoraggio e' davvero configurato e attivo. */
export const monitoraggioAttivo = () => Boolean(dsn) && import.meta.env?.PROD === true;

/**
 * Ultimo passaggio prima dell'invio. Se qualcosa qui lancia, Sentry scarta
 * l'evento: e' il comportamento che vogliamo — meglio perdere un report che
 * spedirlo non ripulito.
 */
const primaDellInvio = (event) => {
  const pulito = rimuoviDatiFinanziari(event);
  if (pulito.request?.url) pulito.request.url = ripulisciUrl(pulito.request.url);
  // Dell'utente teniamo solo l'id: serve a sapere quante persone colpisce un
  // errore, senza dire chi sono.
  if (pulito.user) pulito.user = { id: pulito.user.id };
  return pulito;
};

export const inizializzaSentry = async (app, router) => {
  if (!monitoraggioAttivo()) return false;
  const Sentry = await import('@sentry/vue');
  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.MODE,
    // Nessun dato personale raccolto in automatico (indirizzi IP compresi).
    sendDefaultPii: false,
    // Un campione delle transazioni basta per accorgersi dei rallentamenti
    // senza spendere il piano gratuito in una settimana.
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration({ router })],
    beforeSend: primaDellInvio,
    // `beforeSendSpan`, non `beforeSendTransaction`: dalla versione 11 il
    // tracing lavora in streaming e il secondo viene **ignorato in silenzio**
    // — Sentry lo dice solo con un avviso in console. Restava quindi un canale
    // (gli span di performance, che portano gli URL delle chiamate con le
    // relative query string) su cui il filtro non passava affatto.
    beforeSendSpan: (span) => rimuoviDatiFinanziari(span),
    beforeBreadcrumb: (breadcrumb) => rimuoviDatiFinanziari(breadcrumb),
  });
  return true;
};

/** Collega l'utente agli errori con il solo id, o lo scollega al logout. */
export const identificaUtente = async (userId) => {
  if (!monitoraggioAttivo()) return;
  const Sentry = await import('@sentry/vue');
  Sentry.setUser(userId ? { id: String(userId) } : null);
};

/* ------------------------------------------------------------------------ */
/* Vercel Analytics                                                           */
/* ------------------------------------------------------------------------ */

/**
 * In produzione Vercel serve lo script dal dominio stesso
 * (`/_vercel/insights/script.js`), quindi non serve il pacchetto npm — che
 * peraltro pretende vue-router 4 mentre qui siamo alla 5 — e non serve
 * allargare la CSP: `'self'` copre gia' sia lo script sia l'invio.
 *
 * Non usa cookie ne' fingerprinting: nessun banner di consenso da mostrare.
 */
export const inizializzaAnalytics = () => {
  if (import.meta.env?.PROD !== true) return false;
  if (document.getElementById('wallt-analytics')) return true;
  const script = document.createElement('script');
  script.id = 'wallt-analytics';
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  document.head.appendChild(script);
  return true;
};

/**
 * Evento di prodotto (non un errore): serve a sapere dove le persone si
 * fermano. Il nome e' un'etichetta fissa e i dati sono categorie, mai importi
 * — la stessa disciplina del resto del file.
 */
export const tracciaEvento = (nome, dati = undefined) => {
  if (import.meta.env?.PROD !== true) return;
  window.va?.('event', { name: nome, data: dati });
};
