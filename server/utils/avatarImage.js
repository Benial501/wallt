const { matchBytes } = require('./fileMagicBytes');

/**
 * L'immagine profilo viene ridimensionata dal browser (256x256) e inviata
 * come data URL, quindi qui arriva sempre un payload piccolo: il limite
 * serve solo a impedire che un client modificato usi la colonna come storage.
 */
const AVATAR_MAX_BYTES = 256 * 1024;

/**
 * Solo formati raster. L'SVG è escluso di proposito: è un documento XML che
 * può contenere script ed è ospitato in una colonna che finisce in ogni
 * risposta utente.
 */
const AVATAR_ALLOWED_MIME = ['image/webp', 'image/jpeg', 'image/png'];

const SIGNATURE_CHECKS = {
  'image/png': (buffer) => matchBytes(buffer, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/jpeg': (buffer) => matchBytes(buffer, 0, [0xFF, 0xD8, 0xFF]),
  'image/webp': (buffer) => matchBytes(buffer, 0, [0x52, 0x49, 0x46, 0x46]) // RIFF
    && matchBytes(buffer, 8, [0x57, 0x45, 0x42, 0x50]), // WEBP
};

const DATA_URL_PATTERN = /^data:([a-z0-9][a-z0-9!#$&^_.+-]{0,60}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,60});base64,([A-Za-z0-9+/]+={0,2})$/i;

const fail = (error) => ({ ok: false, error });

/**
 * Valida un data URL di immagine profilo e restituisce il buffer decodificato
 * insieme a una versione canonica del data URL (quella da persistere).
 */
const parseAvatarDataUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0) {
    return fail('Immagine non valida');
  }

  const match = DATA_URL_PATTERN.exec(value.trim());
  if (!match) {
    return fail('Immagine non valida: serve un data URL base64');
  }

  const mime = match[1].toLowerCase();
  const base64 = match[2];

  if (!AVATAR_ALLOWED_MIME.includes(mime)) {
    return fail('Formato non supportato. Usa JPEG, PNG o WebP');
  }

  if (base64.length % 4 !== 0) {
    return fail('Immagine non valida: base64 malformato');
  }

  // Stima prima di decodificare, per non allocare payload enormi.
  if ((base64.length / 4) * 3 > AVATAR_MAX_BYTES + 3) {
    return fail('Immagine troppo grande');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    return fail('Immagine vuota');
  }

  if (buffer.length > AVATAR_MAX_BYTES) {
    return fail('Immagine troppo grande');
  }

  if (!SIGNATURE_CHECKS[mime](buffer)) {
    return fail('Il contenuto non corrisponde al formato dichiarato');
  }

  return {
    ok: true,
    mime,
    buffer,
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
  };
};

module.exports = {
  AVATAR_MAX_BYTES,
  AVATAR_ALLOWED_MIME,
  parseAvatarDataUrl,
};
