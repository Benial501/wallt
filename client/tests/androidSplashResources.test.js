import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const androidRoot = new URL('../android/app/src/main/res/', import.meta.url);
const theme = readFileSync(new URL('values/styles.xml', androidRoot), 'utf8');
const appManifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const mainActivity = readFileSync(new URL('../android/app/src/main/java/com/wallt/app/MainActivity.java', import.meta.url), 'utf8');

test('splash Android usa un segno vettoriale compatto separato dall’icona launcher', () => {
  const appTheme = theme.match(/<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/)?.[0] ?? '';
  const launchTheme = theme.match(/<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/)?.[0] ?? '';

  assert.match(theme, /windowSplashScreenAnimatedIcon[^<]*>@drawable\/wallt_splash_mark/);
  assert.match(theme, /windowSplashScreenBackground[^<]*@color\/wallt_splash_background/);
  assert.match(theme, /postSplashScreenTheme[^<]*@style\/AppTheme\.NoActionBar/);
  assert.match(appTheme, /android:windowBackground[^<]*@color\/wallt_splash_background/);
  assert.doesNotMatch(launchTheme, /android:windowBackground/);
  assert.ok(existsSync(new URL('drawable/wallt_splash_mark.xml', androidRoot)));
  assert.ok(existsSync(new URL('drawable-v31/wallt_splash_mark.xml', androidRoot)));
  assert.match(appManifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.doesNotMatch(theme, /@mipmap\/ic_launcher|@drawable\/splash/);
  for (const density of [
    'drawable',
    'drawable-land-hdpi',
    'drawable-land-mdpi',
    'drawable-land-xhdpi',
    'drawable-land-xxhdpi',
    'drawable-land-xxxhdpi',
    'drawable-port-hdpi',
    'drawable-port-mdpi',
    'drawable-port-xhdpi',
    'drawable-port-xxhdpi',
    'drawable-port-xxxhdpi',
  ]) {
    assert.equal(existsSync(new URL(`${density}/splash.png`, androidRoot)), false);
  }
});

test('splash animata Android 12 non incorpora una bitmap di branding', () => {
  const animatedMark = readFileSync(new URL('drawable-v31/wallt_splash_mark.xml', androidRoot), 'utf8');
  const compactMark = readFileSync(new URL('drawable/wallt_splash_mark.xml', androidRoot), 'utf8');

  assert.match(animatedMark, /<animated-vector/);
  assert.match(animatedMark, /<target/);
  assert.match(compactMark, /<vector/);
  assert.match(compactMark, /android:pathData=/);
  assert.doesNotMatch(compactMark, /ic_launcher|\.png|\.webp/);
});

test('la splash compatibile resta finché il WebView non mostra il primo contenuto', () => {
  assert.match(mainActivity, /SplashScreen\.installSplashScreen\(this\)/);
  assert.ok(
    mainActivity.indexOf('SplashScreen.installSplashScreen(this)') < mainActivity.indexOf('super.onCreate(savedInstanceState)'),
  );
  assert.match(mainActivity, /setKeepOnScreenCondition/);
  assert.match(mainActivity, /addWebViewListener/);
  assert.match(mainActivity, /onPageCommitVisible/);
  assert.ok(mainActivity.indexOf('addWebViewListener') < mainActivity.indexOf('super.load()'));
});
