import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const capacitorConfig = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
const pwaManifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('configurazione Capacitor Android resta allineata a Capacitor 8 e all’identità WALLT', () => {
  const versions = [
    packageJson.dependencies['@capacitor/core'],
    packageJson.dependencies['@capacitor/android'],
    packageJson.devDependencies['@capacitor/cli'],
  ];

  assert.ok(versions.every((version) => /^\^?8\./.test(version ?? '')));
  assert.equal(capacitorConfig.appId, 'com.wallt.app');
  assert.equal(capacitorConfig.appName, 'WALLT');
  assert.equal(capacitorConfig.webDir, 'dist');
  assert.equal(packageJson.scripts['cap:sync:android'], 'npm run build && cap sync android');
  assert.equal(packageJson.scripts['cap:open:android'], 'cap open android');
  assert.ok(packageJson.scripts['cap:sync:ios'], 'la sincronizzazione iOS esistente resta disponibile');
  assert.deepEqual(pwaManifest.icons.map((icon) => icon.src), [
    '/icon-192x192.png',
    '/icon-512x512.png',
    '/icon-maskable-512x512.png',
  ]);
  assert.equal(pwaManifest.display, 'standalone');
});
