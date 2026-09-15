import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Movimento ridotto.
 *
 * Stava in 10 file su 55, e i 45 mancanti non erano una scelta: una regola
 * globale li copre tutti. Questa guardia esiste perché quella regola non
 * sparisca in un riordino dei fogli di stile, e perché la durata resti
 * 0.01ms — con 0 esatto Vue <Transition> puo' non ricevere `transitionend`
 * e un modale resterebbe aperto.
 */
const STYLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'styles');

const css = readdirSync(STYLES)
  .filter((n) => n.endsWith('.css'))
  .map((n) => readFileSync(join(STYLES, n), 'utf8'))
  .join('\n');

test('esiste una regola globale per prefers-reduced-motion', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('la regola globale neutralizza animazioni e transizioni con il selettore universale', () => {
  const blocco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(blocco, /\*,/, 'deve usare il selettore universale');
  assert.match(blocco, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(blocco, /transition-duration:\s*0\.01ms\s*!important/);
});

test('la durata non è zero esatto', () => {
  const blocco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.doesNotMatch(
    blocco, /transition-duration:\s*0s\s*!important/,
    'con 0s Vue <Transition> può non smontare un elemento: usare 0.01ms',
  );
});
