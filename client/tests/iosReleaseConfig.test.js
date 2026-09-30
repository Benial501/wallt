import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = new URL('../ios/', import.meta.url);

const read = (path) => readFile(new URL(path, source), 'utf8');

test('Debug e Release caricano gli ID OAuth locali senza includerli nel repository', async () => {
  const [debugConfig, releaseConfig, project, ignored] = await Promise.all([
    read('debug.xcconfig'),
    read('release.xcconfig'),
    read('App/App.xcodeproj/project.pbxproj'),
    read('.gitignore'),
  ]);

  assert.match(debugConfig, /#include\? "ios\.local\.xcconfig"/);
  assert.match(releaseConfig, /#include\? "ios\.local\.xcconfig"/);
  assert.match(releaseConfig, /CAPACITOR_DEBUG\s*=\s*false/);
  assert.match(project, /504EC3181FED79650016851F \/\* Release \*\/ = \{\s*isa = XCBuildConfiguration;\s*baseConfigurationReference = [A-F0-9]+ \/\* release\.xcconfig \*\//);
  assert.match(ignored, /^ios\.local\.xcconfig$/m);
});
