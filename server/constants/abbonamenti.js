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

// Due addebiti a questa distanza dimostrano che il periodo è davvero mensile.
const GIORNI_ADDEBITO_MENSILE_MIN = 25;
const GIORNI_ADDEBITO_MENSILE_MAX = 35;

const STATI = Object.freeze({ ATTIVO: 'attivo', ANNULLATO: 'annullato', ESCLUSO: 'escluso' });
const ORIGINI = Object.freeze({ MANUALE: 'manuale', RILEVATO: 'rilevato' });

const GRUPPI_SERVIZI = Object.freeze(['video', 'musica', 'ia', 'cloud', 'giochi', 'altro']);
const ICONE_GENERICHE = Object.freeze(['palestra', 'telefono', 'giornali', 'altro']);

// L'ordine conta: l'alias più specifico viene prima, così «Amazon Prime Video»
// è Prime Video e «Apple Music» non cade su un altro servizio Apple.
//
// `categorie_ammesse` copre i servizi che la cascata di categorizzazione manda
// altrove: «Xbox Game Pass» finisce in videogiochi e «Amazon Music» in
// shopping_online. Gli alias sono abbastanza specifici da non catturare un gioco
// o un acquisto qualunque («PlayStation Store» non è «PlayStation Plus»).
const CATALOGO_SERVIZI = Object.freeze([
  { id: 'netflix', nome: 'Netflix', gruppo: 'video', alias: ['netflix'] },
  { id: 'prime-video', nome: 'Prime Video', gruppo: 'video', alias: ['prime video', 'primevideo'], categorie_ammesse: ['shopping_online'] },
  { id: 'disney-plus', nome: 'Disney+', gruppo: 'video', alias: ['disney+', 'disney plus', 'disneyplus'] },
  { id: 'now', nome: 'NOW', gruppo: 'video', alias: ['now tv', 'nowtv', 'now.tv', 'now entertainment'] },
  { id: 'sky', nome: 'Sky', gruppo: 'video', alias: ['sky italia', 'skyitalia', 'sky tv', 'sky'] },
  { id: 'dazn', nome: 'DAZN', gruppo: 'video', alias: ['dazn'] },
  { id: 'apple-tv', nome: 'Apple TV+', gruppo: 'video', alias: ['apple tv', 'appletv'] },
  { id: 'paramount-plus', nome: 'Paramount+', gruppo: 'video', alias: ['paramount+', 'paramount plus', 'paramountplus'] },
  { id: 'youtube-premium', nome: 'YouTube Premium', gruppo: 'video', alias: ['youtube premium', 'youtubepremium'] },
  { id: 'crunchyroll', nome: 'Crunchyroll', gruppo: 'video', alias: ['crunchyroll'] },
  { id: 'spotify', nome: 'Spotify', gruppo: 'musica', alias: ['spotify'] },
  { id: 'apple-music', nome: 'Apple Music', gruppo: 'musica', alias: ['apple music', 'applemusic'] },
  { id: 'amazon-music', nome: 'Amazon Music', gruppo: 'musica', alias: ['amazon music', 'amazonmusic'], categorie_ammesse: ['shopping_online'] },
  { id: 'youtube-music', nome: 'YouTube Music', gruppo: 'musica', alias: ['youtube music', 'youtubemusic'] },
  { id: 'tidal', nome: 'Tidal', gruppo: 'musica', alias: ['tidal'] },
  { id: 'deezer', nome: 'Deezer', gruppo: 'musica', alias: ['deezer'] },
  { id: 'chatgpt', nome: 'ChatGPT', gruppo: 'ia', alias: ['chatgpt', 'chat gpt', 'openai', 'open ai'] },
  { id: 'claude', nome: 'Claude', gruppo: 'ia', alias: ['claude', 'anthropic'] },
  { id: 'gemini', nome: 'Gemini', gruppo: 'ia', alias: ['google gemini', 'gemini'] },
  { id: 'perplexity', nome: 'Perplexity', gruppo: 'ia', alias: ['perplexity'] },
  { id: 'copilot', nome: 'Copilot', gruppo: 'ia', alias: ['github copilot', 'copilot'] },
  { id: 'midjourney', nome: 'Midjourney', gruppo: 'ia', alias: ['midjourney'] },
  { id: 'icloud', nome: 'iCloud+', gruppo: 'cloud', alias: ['icloud'] },
  { id: 'google-one', nome: 'Google One', gruppo: 'cloud', alias: ['google one', 'googleone'] },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'cloud', alias: ['dropbox'] },
  { id: 'microsoft-365', nome: 'Microsoft 365', gruppo: 'cloud', alias: ['microsoft 365', 'microsoft365', 'office 365', 'office365'] },
  { id: 'adobe', nome: 'Adobe', gruppo: 'cloud', alias: ['adobe', 'creative cloud'] },
  { id: 'canva', nome: 'Canva', gruppo: 'cloud', alias: ['canva'] },
  { id: 'notion', nome: 'Notion', gruppo: 'cloud', alias: ['notion'] },
  { id: 'nordvpn', nome: 'NordVPN', gruppo: 'cloud', alias: ['nordvpn', 'nord vpn'] },
  { id: 'playstation-plus', nome: 'PlayStation Plus', gruppo: 'giochi', alias: ['playstation plus', 'ps plus', 'psplus'], categorie_ammesse: ['videogiochi'] },
  { id: 'xbox-game-pass', nome: 'Xbox Game Pass', gruppo: 'giochi', alias: ['xbox game pass', 'game pass', 'gamepass'], categorie_ammesse: ['videogiochi'] },
  { id: 'nintendo-switch-online', nome: 'Nintendo Switch Online', gruppo: 'giochi', alias: ['nintendo switch online', 'nintendo online'], categorie_ammesse: ['videogiochi'] },
  // «amazon» da solo non è un alias: è quasi sempre un acquisto, non un abbonamento.
  { id: 'amazon-prime', nome: 'Amazon Prime', gruppo: 'altro', alias: ['amazon prime', 'amzn prime'], categorie_ammesse: ['shopping_online'] },
  { id: 'audible', nome: 'Audible', gruppo: 'altro', alias: ['audible'], categorie_ammesse: ['libri'] },
  { id: 'kindle-unlimited', nome: 'Kindle Unlimited', gruppo: 'altro', alias: ['kindle unlimited'], categorie_ammesse: ['shopping_online'] },
]);

module.exports = {
  CATEGORIE_ABBONAMENTO,
  CATEGORIE_DA_DESCRIZIONE,
  PERIODI_MESI,
  DURATA_MESI_MAX,
  MESI_FINESTRA_LETTURA,
  GIORNI_ADDEBITO_MENSILE_MIN,
  GIORNI_ADDEBITO_MENSILE_MAX,
  STATI,
  ORIGINI,
  GRUPPI_SERVIZI,
  ICONE_GENERICHE,
  CATALOGO_SERVIZI,
};
