import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const onboarding = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/views/OnboardingView.vue'),
  'utf8',
);

const script = onboarding.slice(0, onboarding.indexOf('<template>'));
const template = onboarding.slice(onboarding.indexOf('<template>'));

test('l’onboarding si attraversa in tre schermate', () => {
  assert.match(script, /const TOTALE_STEP = 3;/);

  const step = (n) => new RegExp(`currentStep === ${n}`);
  for (const n of [1, 2, 3]) {
    assert.match(template, step(n), `manca la schermata ${n}`);
  }
  for (const n of [4, 5]) {
    assert.doesNotMatch(template, step(n), `la schermata ${n} non deve esistere piu'`);
  }

  // Il riepilogo non e' piu' un passo a se': e' la conferma dell'ultimo.
  assert.doesNotMatch(onboarding, /showRiepilogo/);
  assert.match(template, /v-if="canProceed"[\s\S]*?riepilogo-box/);
});

test('l’ultimo passo salva invece di aprire un’altra schermata', () => {
  assert.match(script, /if \(isUltimoStep\.value\) \{\s*await completaOnboarding\(\);/);
  assert.match(template, /isUltimoStep \? 'Il tuo WALLT è pronto →' : 'Avanti →'/);
});

/**
 * La ragione per cui questo file esiste: accorpare cinque schermate in tre
 * doveva ridurre i passi, non le domande. Il profilo finanziario alimenta
 * Piano Smart, e un campo che smette di essere chiesto lo impoverisce in
 * silenzio — nessun test fallirebbe, il piano sarebbe solo meno preciso.
 */
test('nessun campo del profilo si perde per strada', () => {
  const blocco = script.slice(script.indexOf('const form = ref({'));
  const campi = [...blocco.slice(0, blocco.indexOf('});')).matchAll(/^\s{2}(\w+):/gm)]
    .map((m) => m[1]);

  assert.ok(campi.length >= 20, `attesi almeno 20 campi, trovati ${campi.length}`);

  // I flag dei trasporti non compaiono come `form.ha_auto`: sono resi in
  // blocco dal ciclo su TRASPORTI, che li indirizza con `form[t.id]`.
  const trasporti = [...script.slice(script.indexOf('const TRASPORTI'))
    .slice(0, script.slice(script.indexOf('const TRASPORTI')).indexOf('];'))
    .matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
  assert.ok(trasporti.length >= 5, 'la lista dei trasporti non e\u0027 stata letta');
  assert.match(template, /v-for="t in TRASPORTI"[\s\S]*?form\[t\.id\]/);

  for (const campo of campi) {
    if (trasporti.includes(campo)) continue;
    assert.match(
      template,
      new RegExp(`form(\\.|\\[')${campo}`),
      `il campo "${campo}" non viene piu' chiesto in nessuna schermata`,
    );
  }
});

test('ogni gruppo di domande ha la sua etichetta', () => {
  for (const etichetta of ['Fascia d\'età', 'Come lavori?', 'Dove abiti', 'Come ti muovi?']) {
    assert.ok(template.includes(etichetta), `manca l'etichetta "${etichetta}"`);
  }
});
