const {
  parseAvatarDataUrl,
  AVATAR_MAX_BYTES,
} = require('../utils/avatarImage');

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_SIGNATURE = [0xFF, 0xD8, 0xFF, 0xE0];

const buildDataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

const pngBytes = (padding = 32) => [...PNG_SIGNATURE, ...new Array(padding).fill(0)];
const jpegBytes = (padding = 32) => [...JPEG_SIGNATURE, ...new Array(padding).fill(0)];
const webpBytes = (padding = 32) => [
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x00, 0x00, 0x00, 0x00, // dimensione (ignorata)
  0x57, 0x45, 0x42, 0x50, // "WEBP"
  ...new Array(padding).fill(0),
];

describe('parseAvatarDataUrl', () => {
  it('accetta un data URL PNG valido', () => {
    const result = parseAvatarDataUrl(buildDataUrl('image/png', pngBytes()));

    expect(result.ok).toBe(true);
    expect(result.mime).toBe('image/png');
    expect(result.buffer.length).toBe(40);
  });

  it('accetta un data URL JPEG valido', () => {
    const result = parseAvatarDataUrl(buildDataUrl('image/jpeg', jpegBytes()));

    expect(result.ok).toBe(true);
    expect(result.mime).toBe('image/jpeg');
  });

  it('accetta un data URL WebP valido', () => {
    const result = parseAvatarDataUrl(buildDataUrl('image/webp', webpBytes()));

    expect(result.ok).toBe(true);
    expect(result.mime).toBe('image/webp');
  });

  it('rifiuta una stringa che non e un data URL', () => {
    const result = parseAvatarDataUrl('https://example.com/foto.png');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rifiuta un mime non raster come SVG', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
    const result = parseAvatarDataUrl(`data:image/svg+xml;base64,${svg}`);

    expect(result.ok).toBe(false);
  });

  it('rifiuta contenuto il cui magic number non corrisponde al mime dichiarato', () => {
    const result = parseAvatarDataUrl(buildDataUrl('image/png', jpegBytes()));

    expect(result.ok).toBe(false);
  });

  it('rifiuta un base64 non valido', () => {
    const result = parseAvatarDataUrl('data:image/png;base64,!!!non-base64!!!');

    expect(result.ok).toBe(false);
  });

  it('rifiuta un immagine oltre il limite di dimensione', () => {
    const oversize = pngBytes(AVATAR_MAX_BYTES);
    const result = parseAvatarDataUrl(buildDataUrl('image/png', oversize));

    expect(result.ok).toBe(false);
  });

  it('rifiuta valori non stringa', () => {
    expect(parseAvatarDataUrl(null).ok).toBe(false);
    expect(parseAvatarDataUrl(undefined).ok).toBe(false);
    expect(parseAvatarDataUrl(42).ok).toBe(false);
  });
});
