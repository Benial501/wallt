/**
 * Vocabolario condiviso degli abbonamenti (CLAUDE.md Regola 28).
 *
 * Nessun `require` qui, come in `constants/fondoEmergenza.js`: il file deve
 * restare importabile da `client/tests/abbonamentiContratto.test.js`, che gira
 * nel job "Frontend (build)" della CI, dove `server/node_modules` non esiste.
 *
 * Il vocabolario è duplicato in `client/src/utils/abbonamenti.js`. Gli alias
 * restano solo qui: servono a leggere le descrizioni dei movimenti, e il client
 * non legge descrizioni.
 */

// Le stesse che il budget «abbonamenti» già raccoglie (budgetStato.service.js).
const CATEGORIE_ABBONAMENTO = Object.freeze(['abbonamenti', 'streaming', 'musica', 'abbonamenti_digitali']);

// Solo su queste categorie, o senza categoria, il nome di un servizio nella
// descrizione basta da solo. Su ogni altra la categoria decide: «Bonifico a
// Claude Rossi» classificato come trasferimento non è l'abbonamento a Claude.
const CATEGORIE_DA_DESCRIZIONE = Object.freeze(['da_verificare', 'altro_uscita']);

const PERIODI_MESI = Object.freeze([1, 3, 6, 12]);
const DURATA_MESI_MAX = 120;
const MESI_FINESTRA_LETTURA = 3;

// Oltre questa differenza un importo diverso è un altro acquisto o un errore, non
// un rincaro: non deve cambiare il costo di una riga senza che qualcuno lo veda.
const SCARTO_MASSIMO_RINCARO = 0.25;

// Con una di queste parole un nome noto non basta: «Ricarica Vodafone» e «TIM Store»
// parlano di un operatore, ma non sono l'abbonamento. Non valgono se l'utente ha
// scelto lui una categoria di abbonamenti.
const PAROLE_NON_ABBONAMENTO = Object.freeze([
  'ricarica', 'ricariche', 'top up', 'topup', 'store', 'negozio', 'rata', 'rate', 'sim',
  'iscrizione', 'attivazione', 'kit', 'consegna', 'gift card',
]);

// Due addebiti a questa distanza dimostrano che il periodo è davvero mensile.
const GIORNI_ADDEBITO_MENSILE_MIN = 25;
const GIORNI_ADDEBITO_MENSILE_MAX = 35;

const STATI = Object.freeze({ ATTIVO: 'attivo', ANNULLATO: 'annullato', ESCLUSO: 'escluso' });
const ORIGINI = Object.freeze({ MANUALE: 'manuale', RILEVATO: 'rilevato' });

const GRUPPI_SERVIZI = Object.freeze(['video', 'musica', 'ia', 'cloud', 'giochi', 'app', 'notizie', 'telefonia', 'altro']);
const ICONE_GENERICHE = Object.freeze(['palestra', 'telefono', 'giornali', 'altro']);

// L'ordine conta: l'alias più specifico viene prima, così «Amazon Prime Video»
// è Prime Video e «Apple Music» non cade su un altro servizio Apple.
//
// `categorie_ammesse` copre i servizi che la cascata di categorizzazione manda
// altrove: «Xbox Game Pass» finisce in videogiochi e «Amazon Music» in
// shopping_online. Gli alias sono abbastanza specifici da non catturare un gioco
// o un acquisto qualunque («PlayStation Store» non è «PlayStation Plus», e un
// ordine su Glovo non è «Glovo Prime»). `nome_esatto: false` serve dove il nome da
// solo non basta: «Telepass» al casello è un pedaggio, non il canone.
const CATALOGO_SERVIZI = Object.freeze([
  { id: 'netflix', nome: 'Netflix', gruppo: 'video', alias: ['netflix'] },
  { id: 'prime-video', nome: 'Prime Video', gruppo: 'video', alias: ['prime video', 'primevideo'], categorie_ammesse: ['shopping_online'] },
  { id: 'disney-plus', nome: 'Disney+', gruppo: 'video', alias: ['disney+', 'disney plus', 'disneyplus'] },
  { id: 'now', nome: 'NOW', gruppo: 'video', alias: ['now tv', 'nowtv', 'now.tv', 'now entertainment'] },
  { id: 'sky', nome: 'Sky', gruppo: 'video', alias: ['sky italia', 'skyitalia', 'sky tv', 'sky wifi', 'sky glass'] },
  { id: 'dazn', nome: 'DAZN', gruppo: 'video', alias: ['dazn'] },
  { id: 'apple-tv', nome: 'Apple TV+', gruppo: 'video', alias: ['apple tv', 'appletv'] },
  { id: 'paramount-plus', nome: 'Paramount+', gruppo: 'video', alias: ['paramount+', 'paramount plus', 'paramountplus'] },
  { id: 'youtube-premium', nome: 'YouTube Premium', gruppo: 'video', alias: ['youtube premium', 'youtubepremium'] },
  { id: 'crunchyroll', nome: 'Crunchyroll', gruppo: 'video', alias: ['crunchyroll'] },
  { id: 'hbo-max', nome: 'HBO Max', gruppo: 'video', alias: ['hbo max', 'hbomax'] },
  { id: 'discovery-plus', nome: 'discovery+', gruppo: 'video', alias: ['discovery+', 'discovery plus', 'discoveryplus'] },
  { id: 'timvision', nome: 'TIMVISION', gruppo: 'video', alias: ['timvision', 'tim vision'] },
  { id: 'mediaset-infinity', nome: 'Mediaset Infinity', gruppo: 'video', alias: ['mediaset infinity', 'infinity tv', 'infinitytv'] },
  { id: 'mubi', nome: 'MUBI', gruppo: 'video', alias: ['mubi'] },
  { id: 'rakuten-tv', nome: 'Rakuten TV', gruppo: 'video', alias: ['rakuten tv', 'rakutentv'] },
  { id: 'twitch', nome: 'Twitch', gruppo: 'video', alias: ['twitch'] },
  { id: 'spotify', nome: 'Spotify', gruppo: 'musica', alias: ['spotify'] },
  { id: 'apple-music', nome: 'Apple Music', gruppo: 'musica', alias: ['apple music', 'applemusic'] },
  { id: 'amazon-music', nome: 'Amazon Music', gruppo: 'musica', alias: ['amazon music', 'amazonmusic'], categorie_ammesse: ['shopping_online'] },
  { id: 'youtube-music', nome: 'YouTube Music', gruppo: 'musica', alias: ['youtube music', 'youtubemusic'] },
  { id: 'tidal', nome: 'Tidal', gruppo: 'musica', alias: ['tidal'] },
  { id: 'deezer', nome: 'Deezer', gruppo: 'musica', alias: ['deezer'] },
  { id: 'soundcloud', nome: 'SoundCloud', gruppo: 'musica', alias: ['soundcloud'] },
  { id: 'qobuz', nome: 'Qobuz', gruppo: 'musica', alias: ['qobuz'] },
  { id: 'chatgpt', nome: 'ChatGPT', gruppo: 'ia', alias: ['chatgpt', 'chat gpt', 'openai', 'open ai'] },
  { id: 'claude', nome: 'Claude', gruppo: 'ia', alias: ['claude', 'anthropic'] },
  { id: 'gemini', nome: 'Gemini', gruppo: 'ia', alias: ['google gemini', 'gemini advanced'] },
  { id: 'perplexity', nome: 'Perplexity', gruppo: 'ia', alias: ['perplexity'] },
  { id: 'copilot', nome: 'Copilot', gruppo: 'ia', alias: ['github copilot', 'copilot'] },
  { id: 'midjourney', nome: 'Midjourney', gruppo: 'ia', alias: ['midjourney'] },
  { id: 'grok', nome: 'Grok', gruppo: 'ia', alias: ['grok', 'x.ai'] },
  { id: 'mistral', nome: 'Mistral', gruppo: 'ia', alias: ['mistral ai', 'mistral.ai'] },
  { id: 'cursor', nome: 'Cursor', gruppo: 'ia', alias: ['cursor ai', 'cursor.com', 'cursor.sh'] },
  { id: 'elevenlabs', nome: 'ElevenLabs', gruppo: 'ia', alias: ['elevenlabs', 'eleven labs'] },
  { id: 'suno', nome: 'Suno', gruppo: 'ia', alias: ['suno ai', 'suno.com'] },
  { id: 'icloud', nome: 'iCloud+', gruppo: 'cloud', alias: ['icloud'] },
  { id: 'google-one', nome: 'Google One', gruppo: 'cloud', alias: ['google one', 'googleone'] },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'cloud', alias: ['dropbox'] },
  { id: 'microsoft-365', nome: 'Microsoft 365', gruppo: 'cloud', alias: ['microsoft 365', 'microsoft365', 'office 365', 'office365'] },
  { id: 'adobe', nome: 'Adobe', gruppo: 'cloud', alias: ['adobe', 'creative cloud'] },
  { id: 'canva', nome: 'Canva', gruppo: 'cloud', alias: ['canva'] },
  { id: 'notion', nome: 'Notion', gruppo: 'cloud', alias: ['notion'] },
  { id: 'nordvpn', nome: 'NordVPN', gruppo: 'cloud', alias: ['nordvpn', 'nord vpn'] },
  { id: 'github', nome: 'GitHub', gruppo: 'cloud', alias: ['github'] },
  { id: 'apple-one', nome: 'Apple One', gruppo: 'cloud', alias: ['apple one', 'appleone'] },
  { id: 'google-workspace', nome: 'Google Workspace', gruppo: 'cloud', alias: ['google workspace', 'g suite', 'gsuite'] },
  { id: 'proton', nome: 'Proton', gruppo: 'cloud', alias: ['proton mail', 'protonmail', 'proton vpn', 'protonvpn', 'proton ag'] },
  { id: 'expressvpn', nome: 'ExpressVPN', gruppo: 'cloud', alias: ['expressvpn', 'express vpn'] },
  { id: 'surfshark', nome: 'Surfshark', gruppo: 'cloud', alias: ['surfshark'] },
  { id: '1password', nome: '1Password', gruppo: 'cloud', alias: ['1password'] },
  { id: 'bitwarden', nome: 'Bitwarden', gruppo: 'cloud', alias: ['bitwarden'] },
  { id: 'lastpass', nome: 'LastPass', gruppo: 'cloud', alias: ['lastpass'] },
  { id: 'dashlane', nome: 'Dashlane', gruppo: 'cloud', alias: ['dashlane'] },
  { id: 'figma', nome: 'Figma', gruppo: 'cloud', alias: ['figma'] },
  { id: 'slack', nome: 'Slack', gruppo: 'cloud', alias: ['slack'] },
  { id: 'zoom', nome: 'Zoom', gruppo: 'cloud', alias: ['zoom.us', 'zoom video', 'zoom communications'] },
  { id: 'grammarly', nome: 'Grammarly', gruppo: 'cloud', alias: ['grammarly'] },
  { id: 'evernote', nome: 'Evernote', gruppo: 'cloud', alias: ['evernote'] },
  { id: 'todoist', nome: 'Todoist', gruppo: 'cloud', alias: ['todoist'] },
  { id: 'capcut', nome: 'CapCut', gruppo: 'cloud', alias: ['capcut'] },
  { id: 'norton', nome: 'Norton', gruppo: 'cloud', alias: ['norton 360', 'norton antivirus', 'norton security', 'nortonlifelock'] },
  { id: 'mcafee', nome: 'McAfee', gruppo: 'cloud', alias: ['mcafee'] },
  { id: 'playstation-plus', nome: 'PlayStation Plus', gruppo: 'giochi', alias: ['playstation plus', 'ps plus', 'psplus'], categorie_ammesse: ['videogiochi'] },
  { id: 'xbox-game-pass', nome: 'Xbox Game Pass', gruppo: 'giochi', alias: ['xbox game pass', 'game pass', 'gamepass'], categorie_ammesse: ['videogiochi'] },
  { id: 'nintendo-switch-online', nome: 'Nintendo Switch Online', gruppo: 'giochi', alias: ['nintendo switch online', 'nintendo online'], categorie_ammesse: ['videogiochi'] },
  { id: 'ea-play', nome: 'EA Play', gruppo: 'giochi', alias: ['ea play', 'eaplay'], categorie_ammesse: ['videogiochi'] },
  { id: 'ubisoft-plus', nome: 'Ubisoft+', gruppo: 'giochi', alias: ['ubisoft+', 'ubisoft plus', 'ubisoftplus'], categorie_ammesse: ['videogiochi'] },
  { id: 'geforce-now', nome: 'GeForce NOW', gruppo: 'giochi', alias: ['geforce now', 'geforcenow'], categorie_ammesse: ['videogiochi'] },
  { id: 'apple-arcade', nome: 'Apple Arcade', gruppo: 'giochi', alias: ['apple arcade'], categorie_ammesse: ['videogiochi'] },
  { id: 'google-play-pass', nome: 'Google Play Pass', gruppo: 'giochi', alias: ['google play pass', 'play pass'], categorie_ammesse: ['videogiochi'] },
  { id: 'duolingo', nome: 'Duolingo', gruppo: 'app', alias: ['duolingo'], categorie_ammesse: ['corsi', 'formazione_online'] },
  { id: 'strava', nome: 'Strava', gruppo: 'app', alias: ['strava'], categorie_ammesse: ['sport'] },
  { id: 'headspace', nome: 'Headspace', gruppo: 'app', alias: ['headspace'], categorie_ammesse: ['benessere', 'salute'] },
  { id: 'calm', nome: 'Calm', gruppo: 'app', alias: ['calm.com', 'calm app'], categorie_ammesse: ['benessere', 'salute'] },
  { id: 'myfitnesspal', nome: 'MyFitnessPal', gruppo: 'app', alias: ['myfitnesspal'], categorie_ammesse: ['sport', 'salute'] },
  { id: 'tinder', nome: 'Tinder', gruppo: 'app', alias: ['tinder'] },
  { id: 'bumble', nome: 'Bumble', gruppo: 'app', alias: ['bumble'] },
  { id: 'linkedin-premium', nome: 'LinkedIn Premium', gruppo: 'app', alias: ['linkedin premium', 'linkedin'] },
  { id: 'x-premium', nome: 'X Premium', gruppo: 'app', alias: ['x premium', 'twitter blue'] },
  { id: 'telegram-premium', nome: 'Telegram Premium', gruppo: 'app', alias: ['telegram premium'] },
  { id: 'uber-one', nome: 'Uber One', gruppo: 'app', alias: ['uber one'], categorie_ammesse: ['taxi'] },
  { id: 'deliveroo-plus', nome: 'Deliveroo Plus', gruppo: 'app', alias: ['deliveroo plus'], categorie_ammesse: ['delivery'] },
  { id: 'glovo-prime', nome: 'Glovo Prime', gruppo: 'app', alias: ['glovo prime'], categorie_ammesse: ['delivery'] },
  { id: 'mcfit', nome: 'McFIT', gruppo: 'app', alias: ['mcfit'], categorie_ammesse: ['palestra', 'sport', 'svago'] },
  { id: 'fitactive', nome: 'FitActive', gruppo: 'app', alias: ['fitactive', 'fit active'], categorie_ammesse: ['palestra', 'sport', 'svago'] },
  { id: 'virgin-active', nome: 'Virgin Active', gruppo: 'app', alias: ['virgin active'], categorie_ammesse: ['palestra', 'sport', 'svago'] },
  { id: 'corriere', nome: 'Corriere della Sera', gruppo: 'notizie', alias: ['corriere della sera', 'corriere.it'] },
  { id: 'repubblica', nome: 'la Repubblica', gruppo: 'notizie', alias: ['la repubblica', 'repubblica.it'] },
  { id: 'sole-24-ore', nome: 'Il Sole 24 Ore', gruppo: 'notizie', alias: ['il sole 24 ore', 'sole 24 ore', 'ilsole24ore', 'sole24ore'] },
  { id: 'gazzetta', nome: 'La Gazzetta dello Sport', gruppo: 'notizie', alias: ['gazzetta dello sport', 'gazzetta.it'] },
  { id: 'new-york-times', nome: 'The New York Times', gruppo: 'notizie', alias: ['new york times', 'nytimes'] },
  { id: 'medium', nome: 'Medium', gruppo: 'notizie', alias: ['medium.com'] },
  { id: 'substack', nome: 'Substack', gruppo: 'notizie', alias: ['substack'] },
  { id: 'tim', nome: 'TIM', gruppo: 'telefonia', alias: ['tim spa', 'tim s.p.a', 'telecom italia'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'vodafone', nome: 'Vodafone', gruppo: 'telefonia', alias: ['vodafone'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'windtre', nome: 'WindTre', gruppo: 'telefonia', alias: ['windtre', 'wind tre', 'wind3'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'iliad', nome: 'iliad', gruppo: 'telefonia', alias: ['iliad'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'fastweb', nome: 'Fastweb', gruppo: 'telefonia', alias: ['fastweb'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'ho-mobile', nome: 'ho. Mobile', gruppo: 'telefonia', alias: ['ho mobile', 'ho. mobile', 'ho.mobile'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'kena', nome: 'Kena Mobile', gruppo: 'telefonia', alias: ['kena mobile'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'very-mobile', nome: 'Very Mobile', gruppo: 'telefonia', alias: ['very mobile'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'coopvoce', nome: 'CoopVoce', gruppo: 'telefonia', alias: ['coopvoce', 'coop voce'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'postemobile', nome: 'PosteMobile', gruppo: 'telefonia', alias: ['postemobile', 'poste mobile'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  { id: 'starlink', nome: 'Starlink', gruppo: 'telefonia', alias: ['starlink'], categorie_ammesse: ['telefono', 'internet', 'bollette'] },
  // «amazon» da solo non è un alias: è quasi sempre un acquisto, non un abbonamento.
  { id: 'amazon-prime', nome: 'Amazon Prime', gruppo: 'altro', alias: ['amazon prime', 'amzn prime'], categorie_ammesse: ['shopping_online'] },
  { id: 'audible', nome: 'Audible', gruppo: 'altro', alias: ['audible'], categorie_ammesse: ['libri'] },
  { id: 'kindle-unlimited', nome: 'Kindle Unlimited', gruppo: 'altro', alias: ['kindle unlimited'], categorie_ammesse: ['shopping_online'] },
  { id: 'revolut-premium', nome: 'Revolut Premium', gruppo: 'altro', alias: ['revolut premium', 'revolut metal', 'revolut plus', 'revolut ultra'], categorie_ammesse: ['commissioni_bancarie'] },
  { id: 'telepass', nome: 'Telepass', gruppo: 'altro', alias: ['canone telepass', 'telepass canone'], categorie_ammesse: ['pedaggi'], nome_esatto: false },
]);

module.exports = {
  CATEGORIE_ABBONAMENTO,
  CATEGORIE_DA_DESCRIZIONE,
  PERIODI_MESI,
  DURATA_MESI_MAX,
  MESI_FINESTRA_LETTURA,
  SCARTO_MASSIMO_RINCARO,
  PAROLE_NON_ABBONAMENTO,
  GIORNI_ADDEBITO_MENSILE_MIN,
  GIORNI_ADDEBITO_MENSILE_MAX,
  STATI,
  ORIGINI,
  GRUPPI_SERVIZI,
  ICONE_GENERICHE,
  CATALOGO_SERVIZI,
};
