/**
 * Vocabolario e conti degli abbonamenti lato client: duplicati di proposito da
 * `server/constants/abbonamenti.js` e `server/utils/abbonamentiCosti.js`, e
 * sorvegliati da `client/tests/abbonamentiContratto.test.js`.
 *
 * I numeri di schede e totali arrivano dal server. Il `calcolaCosti` di qui serve
 * solo al riquadro del modulo, che mostra il conto mentre si scrive.
 */

export const PERIODI_MESI = Object.freeze([1, 3, 6, 12]);
export const DURATA_MESI_MAX = 120;

export const STATI = Object.freeze({ ATTIVO: 'attivo', ANNULLATO: 'annullato', ESCLUSO: 'escluso' });
export const ORIGINI = Object.freeze({ MANUALE: 'manuale', RILEVATO: 'rilevato' });

export const GRUPPI_SERVIZI = Object.freeze([
  { id: 'video', etichetta: 'Video' },
  { id: 'musica', etichetta: 'Musica' },
  { id: 'ia', etichetta: 'Intelligenza artificiale' },
  { id: 'cloud', etichetta: 'Cloud e software' },
  { id: 'giochi', etichetta: 'Giochi' },
  { id: 'app', etichetta: 'App e benessere' },
  { id: 'notizie', etichetta: 'Giornali e notizie' },
  { id: 'telefonia', etichetta: 'Telefono e internet' },
  { id: 'altro', etichetta: 'Altro' },
]);

export const ICONE_GENERICHE = Object.freeze([
  { id: 'palestra', nome: 'Palestra' },
  { id: 'telefono', nome: 'Telefono' },
  { id: 'giornali', nome: 'Giornali' },
  { id: 'altro', nome: 'Altro' },
]);

export const CATALOGO_SERVIZI = Object.freeze([
  { id: 'netflix', nome: 'Netflix', gruppo: 'video' },
  { id: 'prime-video', nome: 'Prime Video', gruppo: 'video' },
  { id: 'disney-plus', nome: 'Disney+', gruppo: 'video' },
  { id: 'now', nome: 'NOW', gruppo: 'video' },
  { id: 'sky', nome: 'Sky', gruppo: 'video' },
  { id: 'dazn', nome: 'DAZN', gruppo: 'video' },
  { id: 'apple-tv', nome: 'Apple TV+', gruppo: 'video' },
  { id: 'paramount-plus', nome: 'Paramount+', gruppo: 'video' },
  { id: 'youtube-premium', nome: 'YouTube Premium', gruppo: 'video' },
  { id: 'crunchyroll', nome: 'Crunchyroll', gruppo: 'video' },
  { id: 'hbo-max', nome: 'HBO Max', gruppo: 'video' },
  { id: 'discovery-plus', nome: 'discovery+', gruppo: 'video' },
  { id: 'timvision', nome: 'TIMVISION', gruppo: 'video' },
  { id: 'mediaset-infinity', nome: 'Mediaset Infinity', gruppo: 'video' },
  { id: 'mubi', nome: 'MUBI', gruppo: 'video' },
  { id: 'rakuten-tv', nome: 'Rakuten TV', gruppo: 'video' },
  { id: 'twitch', nome: 'Twitch', gruppo: 'video' },
  { id: 'spotify', nome: 'Spotify', gruppo: 'musica' },
  { id: 'apple-music', nome: 'Apple Music', gruppo: 'musica' },
  { id: 'amazon-music', nome: 'Amazon Music', gruppo: 'musica' },
  { id: 'youtube-music', nome: 'YouTube Music', gruppo: 'musica' },
  { id: 'tidal', nome: 'Tidal', gruppo: 'musica' },
  { id: 'deezer', nome: 'Deezer', gruppo: 'musica' },
  { id: 'soundcloud', nome: 'SoundCloud', gruppo: 'musica' },
  { id: 'qobuz', nome: 'Qobuz', gruppo: 'musica' },
  { id: 'chatgpt', nome: 'ChatGPT', gruppo: 'ia' },
  { id: 'claude', nome: 'Claude', gruppo: 'ia' },
  { id: 'gemini', nome: 'Gemini', gruppo: 'ia' },
  { id: 'perplexity', nome: 'Perplexity', gruppo: 'ia' },
  { id: 'copilot', nome: 'Copilot', gruppo: 'ia' },
  { id: 'midjourney', nome: 'Midjourney', gruppo: 'ia' },
  { id: 'grok', nome: 'Grok', gruppo: 'ia' },
  { id: 'mistral', nome: 'Mistral', gruppo: 'ia' },
  { id: 'cursor', nome: 'Cursor', gruppo: 'ia' },
  { id: 'elevenlabs', nome: 'ElevenLabs', gruppo: 'ia' },
  { id: 'suno', nome: 'Suno', gruppo: 'ia' },
  { id: 'icloud', nome: 'iCloud+', gruppo: 'cloud' },
  { id: 'google-one', nome: 'Google One', gruppo: 'cloud' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'cloud' },
  { id: 'microsoft-365', nome: 'Microsoft 365', gruppo: 'cloud' },
  { id: 'adobe', nome: 'Adobe', gruppo: 'cloud' },
  { id: 'canva', nome: 'Canva', gruppo: 'cloud' },
  { id: 'notion', nome: 'Notion', gruppo: 'cloud' },
  { id: 'nordvpn', nome: 'NordVPN', gruppo: 'cloud' },
  { id: 'github', nome: 'GitHub', gruppo: 'cloud' },
  { id: 'apple-one', nome: 'Apple One', gruppo: 'cloud' },
  { id: 'google-workspace', nome: 'Google Workspace', gruppo: 'cloud' },
  { id: 'proton', nome: 'Proton', gruppo: 'cloud' },
  { id: 'expressvpn', nome: 'ExpressVPN', gruppo: 'cloud' },
  { id: 'surfshark', nome: 'Surfshark', gruppo: 'cloud' },
  { id: '1password', nome: '1Password', gruppo: 'cloud' },
  { id: 'bitwarden', nome: 'Bitwarden', gruppo: 'cloud' },
  { id: 'lastpass', nome: 'LastPass', gruppo: 'cloud' },
  { id: 'dashlane', nome: 'Dashlane', gruppo: 'cloud' },
  { id: 'figma', nome: 'Figma', gruppo: 'cloud' },
  { id: 'slack', nome: 'Slack', gruppo: 'cloud' },
  { id: 'zoom', nome: 'Zoom', gruppo: 'cloud' },
  { id: 'grammarly', nome: 'Grammarly', gruppo: 'cloud' },
  { id: 'evernote', nome: 'Evernote', gruppo: 'cloud' },
  { id: 'todoist', nome: 'Todoist', gruppo: 'cloud' },
  { id: 'capcut', nome: 'CapCut', gruppo: 'cloud' },
  { id: 'norton', nome: 'Norton', gruppo: 'cloud' },
  { id: 'mcafee', nome: 'McAfee', gruppo: 'cloud' },
  { id: 'playstation-plus', nome: 'PlayStation Plus', gruppo: 'giochi' },
  { id: 'xbox-game-pass', nome: 'Xbox Game Pass', gruppo: 'giochi' },
  { id: 'nintendo-switch-online', nome: 'Nintendo Switch Online', gruppo: 'giochi' },
  { id: 'ea-play', nome: 'EA Play', gruppo: 'giochi' },
  { id: 'ubisoft-plus', nome: 'Ubisoft+', gruppo: 'giochi' },
  { id: 'geforce-now', nome: 'GeForce NOW', gruppo: 'giochi' },
  { id: 'apple-arcade', nome: 'Apple Arcade', gruppo: 'giochi' },
  { id: 'google-play-pass', nome: 'Google Play Pass', gruppo: 'giochi' },
  { id: 'duolingo', nome: 'Duolingo', gruppo: 'app' },
  { id: 'strava', nome: 'Strava', gruppo: 'app' },
  { id: 'headspace', nome: 'Headspace', gruppo: 'app' },
  { id: 'calm', nome: 'Calm', gruppo: 'app' },
  { id: 'myfitnesspal', nome: 'MyFitnessPal', gruppo: 'app' },
  { id: 'tinder', nome: 'Tinder', gruppo: 'app' },
  { id: 'bumble', nome: 'Bumble', gruppo: 'app' },
  { id: 'linkedin-premium', nome: 'LinkedIn Premium', gruppo: 'app' },
  { id: 'x-premium', nome: 'X Premium', gruppo: 'app' },
  { id: 'telegram-premium', nome: 'Telegram Premium', gruppo: 'app' },
  { id: 'uber-one', nome: 'Uber One', gruppo: 'app' },
  { id: 'deliveroo-plus', nome: 'Deliveroo Plus', gruppo: 'app' },
  { id: 'glovo-prime', nome: 'Glovo Prime', gruppo: 'app' },
  { id: 'mcfit', nome: 'McFIT', gruppo: 'app' },
  { id: 'fitactive', nome: 'FitActive', gruppo: 'app' },
  { id: 'virgin-active', nome: 'Virgin Active', gruppo: 'app' },
  { id: 'corriere', nome: 'Corriere della Sera', gruppo: 'notizie' },
  { id: 'repubblica', nome: 'la Repubblica', gruppo: 'notizie' },
  { id: 'sole-24-ore', nome: 'Il Sole 24 Ore', gruppo: 'notizie' },
  { id: 'gazzetta', nome: 'La Gazzetta dello Sport', gruppo: 'notizie' },
  { id: 'new-york-times', nome: 'The New York Times', gruppo: 'notizie' },
  { id: 'medium', nome: 'Medium', gruppo: 'notizie' },
  { id: 'substack', nome: 'Substack', gruppo: 'notizie' },
  { id: 'tim', nome: 'TIM', gruppo: 'telefonia' },
  { id: 'vodafone', nome: 'Vodafone', gruppo: 'telefonia' },
  { id: 'windtre', nome: 'WindTre', gruppo: 'telefonia' },
  { id: 'iliad', nome: 'iliad', gruppo: 'telefonia' },
  { id: 'fastweb', nome: 'Fastweb', gruppo: 'telefonia' },
  { id: 'ho-mobile', nome: 'ho. Mobile', gruppo: 'telefonia' },
  { id: 'kena', nome: 'Kena Mobile', gruppo: 'telefonia' },
  { id: 'very-mobile', nome: 'Very Mobile', gruppo: 'telefonia' },
  { id: 'coopvoce', nome: 'CoopVoce', gruppo: 'telefonia' },
  { id: 'postemobile', nome: 'PosteMobile', gruppo: 'telefonia' },
  { id: 'starlink', nome: 'Starlink', gruppo: 'telefonia' },
  { id: 'amazon-prime', nome: 'Amazon Prime', gruppo: 'altro' },
  { id: 'audible', nome: 'Audible', gruppo: 'altro' },
  { id: 'kindle-unlimited', nome: 'Kindle Unlimited', gruppo: 'altro' },
  { id: 'revolut-premium', nome: 'Revolut Premium', gruppo: 'altro' },
  { id: 'telepass', nome: 'Telepass', gruppo: 'altro' },
]);

const aCentesimi = (valore) => Math.round(Number(valore) * 100);

export const calcolaCosti = ({ costo, periodo_mesi: periodo, durata_mesi: durata }) => {
  const centesimi = aCentesimi(costo);
  const inUnAnno = centesimi * (12 / periodo);
  const pagamenti = durata == null ? null : Math.ceil(durata / periodo);
  return {
    al_mese: Math.round(inUnAnno / 12),
    in_un_anno: inUnAnno,
    in_totale: pagamenti === null ? null : centesimi * pagamenti,
    peso_annuo: pagamenti === null ? inUnAnno : centesimi * Math.min(pagamenti, 12 / periodo),
  };
};

const formattaMesi = (mesi) => (mesi === 1 ? '1 mese' : `${mesi} mesi`);

export const etichettaPeriodo = (periodoMesi) => {
  if (periodoMesi === 1) return 'Ogni mese';
  if (periodoMesi === 12) return 'Ogni anno';
  return `Ogni ${formattaMesi(periodoMesi)}`;
};

/** Il valore della riga «Durata» sulla scheda. */
export const descriviDurata = ({ periodo_mesi: periodo, durata_mesi: durata }) => (
  durata == null ? etichettaPeriodo(periodo) : formattaMesi(durata)
);
