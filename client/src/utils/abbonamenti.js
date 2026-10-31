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
  { id: 'spotify', nome: 'Spotify', gruppo: 'musica' },
  { id: 'apple-music', nome: 'Apple Music', gruppo: 'musica' },
  { id: 'amazon-music', nome: 'Amazon Music', gruppo: 'musica' },
  { id: 'youtube-music', nome: 'YouTube Music', gruppo: 'musica' },
  { id: 'tidal', nome: 'Tidal', gruppo: 'musica' },
  { id: 'deezer', nome: 'Deezer', gruppo: 'musica' },
  { id: 'chatgpt', nome: 'ChatGPT', gruppo: 'ia' },
  { id: 'claude', nome: 'Claude', gruppo: 'ia' },
  { id: 'gemini', nome: 'Gemini', gruppo: 'ia' },
  { id: 'perplexity', nome: 'Perplexity', gruppo: 'ia' },
  { id: 'copilot', nome: 'Copilot', gruppo: 'ia' },
  { id: 'midjourney', nome: 'Midjourney', gruppo: 'ia' },
  { id: 'icloud', nome: 'iCloud+', gruppo: 'cloud' },
  { id: 'google-one', nome: 'Google One', gruppo: 'cloud' },
  { id: 'dropbox', nome: 'Dropbox', gruppo: 'cloud' },
  { id: 'microsoft-365', nome: 'Microsoft 365', gruppo: 'cloud' },
  { id: 'adobe', nome: 'Adobe', gruppo: 'cloud' },
  { id: 'canva', nome: 'Canva', gruppo: 'cloud' },
  { id: 'notion', nome: 'Notion', gruppo: 'cloud' },
  { id: 'nordvpn', nome: 'NordVPN', gruppo: 'cloud' },
  { id: 'playstation-plus', nome: 'PlayStation Plus', gruppo: 'giochi' },
  { id: 'xbox-game-pass', nome: 'Xbox Game Pass', gruppo: 'giochi' },
  { id: 'nintendo-switch-online', nome: 'Nintendo Switch Online', gruppo: 'giochi' },
  { id: 'amazon-prime', nome: 'Amazon Prime', gruppo: 'altro' },
  { id: 'audible', nome: 'Audible', gruppo: 'altro' },
  { id: 'kindle-unlimited', nome: 'Kindle Unlimited', gruppo: 'altro' },
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
