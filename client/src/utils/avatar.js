/**
 * Immagine profilo: validazione dell'input, ritaglio e scelta della sorgente
 * da mostrare. Qui sta solo logica pura — il disegno su canvas vive nel
 * componente, perché richiede il DOM.
 */

/** Limite sul file scelto dall'utente, prima del ridimensionamento. */
export const AVATAR_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Lato dell'immagine inviata al server. */
export const AVATAR_OUTPUT_SIZE = 256;

export const AVATAR_ACCEPT = 'image/*';

/**
 * Accettiamo qualunque immagine il browser sappia decodificare (così le foto
 * HEIC di iPhone passano su Safari): tanto il risultato viene sempre
 * ricodificato in WebP/JPEG prima dell'invio. L'SVG resta fuori perché è un
 * documento XML, non una fotografia.
 */
export const validaFileImmagine = (file) => {
  if (!file || typeof file.type !== 'string') {
    return { valido: false, errore: 'Nessuna immagine selezionata' };
  }

  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return { valido: false, errore: 'Il file non è un\'immagine valida' };
  }

  if (!file.size) {
    return { valido: false, errore: 'L\'immagine è vuota' };
  }

  if (file.size > AVATAR_MAX_FILE_BYTES) {
    return { valido: false, errore: 'Immagine troppo grande: massimo 10 MB' };
  }

  return { valido: true, errore: null };
};

/** Riquadro centrale più grande possibile, per non deformare la foto. */
export const calcolaRitaglioQuadrato = (larghezza, altezza) => {
  const lato = Math.min(larghezza, altezza);
  return {
    sx: Math.floor((larghezza - lato) / 2),
    sy: Math.floor((altezza - lato) / 2),
    lato,
  };
};

/**
 * Priorità: immagine caricata dall'utente, poi la foto Google, poi niente
 * (il chiamante mostra le iniziali).
 */
export const avatarSorgente = (utente) => {
  const caricata = utente?.avatar_immagine;
  if (typeof caricata === 'string' && caricata.startsWith('data:image/')) {
    return caricata;
  }

  const remota = utente?.avatar;
  if (typeof remota === 'string' && /^https?:\/\//i.test(remota)) {
    return remota;
  }

  return null;
};

export const inizialiNome = (nome, max = 2) => {
  if (typeof nome !== 'string' || !nome.trim()) return '?';

  return nome
    .trim()
    .split(/\s+/)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()
    .slice(0, max);
};

/**
 * Decodifica il file rispettando l'orientamento EXIF: le foto scattate col
 * telefono arrivano quasi sempre ruotate.
 */
const decodificaImmagine = async (file) => {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Immagine non leggibile'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Ritaglia al centro, ridimensiona e ricodifica il file scelto dall'utente.
 * Il risultato è il data URL da inviare all'API: pochi KB, formato garantito.
 * WebP quando il browser lo esporta, altrimenti JPEG.
 */
export const creaDataUrlAvatar = async (file, lato = AVATAR_OUTPUT_SIZE) => {
  const immagine = await decodificaImmagine(file);
  const larghezza = immagine.width;
  const altezza = immagine.height;

  if (!larghezza || !altezza) {
    throw new Error('Immagine non leggibile');
  }

  const ritaglio = calcolaRitaglioQuadrato(larghezza, altezza);
  const canvas = document.createElement('canvas');
  canvas.width = lato;
  canvas.height = lato;

  const contesto = canvas.getContext('2d');
  contesto.drawImage(
    immagine,
    ritaglio.sx, ritaglio.sy, ritaglio.lato, ritaglio.lato,
    0, 0, lato, lato,
  );
  immagine.close?.();

  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
};
