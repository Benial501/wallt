import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Capacitor usa il bundle locale e identifica WALLT', async () => {
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appId, 'com.wallt.app');
  assert.equal(config.appName, 'WALLT');
  assert.equal(config.webDir, 'dist');
  assert.equal(config.server, undefined);
});
