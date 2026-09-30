import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { inflateSync } from 'node:zlib';

const selectorSource = readFileSync(new URL('../public/manifest-selector.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.android.webmanifest', import.meta.url), 'utf8'));
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function selectManifest(userAgent) {
  const registeredLinks = [];
  const sandbox = {
    navigator: { userAgent },
    document: {
      createElement: () => ({}),
      head: { appendChild: (link) => registeredLinks.push(link) },
    },
  };

  runInNewContext(selectorSource, sandbox);
  return registeredLinks;
}

test('seleziona la variante PWA solo per Android e mantiene quella iOS esistente', () => {
  const androidLinks = selectManifest('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36');
  const iphoneLinks = selectManifest('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');

  assert.equal(androidLinks.length, 1);
  assert.equal(androidLinks[0].rel, 'manifest');
  assert.equal(androidLinks[0].href, '/manifest.android.webmanifest');
  assert.equal(iphoneLinks.length, 1);
  assert.equal(iphoneLinks[0].href, '/manifest.webmanifest');
  assert.match(index, /apple-touch-icon\.png/);
  assert.match(index, /manifest-selector\.js/);
  assert.doesNotMatch(index, /<link rel="manifest"/);
});

test('la variante Android conserva l’icona launcher e usa una risorsa splash nera', () => {
  const pwaManifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const brandedManifest = JSON.parse(readFileSync(new URL('../public/manifest.android.webmanifest', import.meta.url), 'utf8'));

  assert.equal(brandedManifest.name, pwaManifest.name);
  assert.equal(brandedManifest.short_name, pwaManifest.short_name);
  assert.equal(brandedManifest.start_url, pwaManifest.start_url);
  assert.equal(brandedManifest.scope, pwaManifest.scope);
  assert.equal(brandedManifest.background_color, '#000000');
  assert.deepEqual(brandedManifest.icons.map(({ purpose }) => purpose), ['any', 'any', 'maskable']);
  assert.equal(brandedManifest.icons[0].src, '/icon-192x192.png');
  assert.equal(brandedManifest.icons[2].src, '/icon-maskable-512x512.png');
  assert.equal(brandedManifest.icons[1].src, '/android-splash-black-512.png');

  const png = readFileSync(new URL('../public/android-splash-black-512.png', import.meta.url));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[24], 8);
  assert.equal(png[25], 2);

  const imageData = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') imageData.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(imageData));
  for (let row = 0; row < 512; row += 1) {
    const rowStart = row * (1 + 512 * 3);
    assert.equal(pixels[rowStart], 0, 'la riga usa il filtro PNG nessuno');
    assert.ok(pixels.subarray(rowStart + 1, rowStart + 1 + 512 * 3).every((value) => value === 0));
  }
});
