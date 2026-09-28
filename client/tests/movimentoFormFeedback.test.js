import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const component = readFileSync(join(ROOT, 'src/components/movimenti/MovimentoForm.vue'), 'utf8');
const templateStart = component.indexOf('<template>') + '<template>'.length;
const template = component.slice(templateStart, component.lastIndexOf('</template>'));

test('il form Entrata/Uscita mostra sempre la descrizione, anche per i movimenti immediati', () => {
  const inputIndex = template.indexOf('v-model="form.descrizione"');
  assert.notEqual(inputIndex, -1, 'il campo deve raccogliere la descrizione');

  const fieldStart = template.lastIndexOf('<div', inputIndex);
  const fieldOpeningTag = template.slice(fieldStart, template.indexOf('>', fieldStart) + 1);
  const fieldMarkup = template.slice(fieldStart, template.indexOf('</div>', inputIndex) + '</div>'.length);

  assert.doesNotMatch(fieldOpeningTag, /\bv-if=/, 'la descrizione non deve dipendere dalla programmazione o dalla modifica');
  assert.match(fieldMarkup, /<label>Descrizione \(opzionale\)<\/label>/);
});

test('il successo viene confermato appena il server salva, prima delle ricariche della vista', () => {
  const salvaStart = component.indexOf('const salva = async () => {');
  const salvaEnd = component.indexOf('const cambiaRicorrenza', salvaStart);
  const salva = component.slice(salvaStart, salvaEnd);
  const confermaIndex = salva.indexOf('toastStore.success(messaggio)');
  const refreshIndex = salva.indexOf('await contiStore.refreshDopoScrittura(');

  assert.notEqual(confermaIndex, -1, 'deve esserci una conferma visibile di successo');
  assert.notEqual(refreshIndex, -1, 'saldi e patrimonio devono continuare ad aggiornarsi');
  assert.ok(confermaIndex < refreshIndex, 'una ricarica lenta non deve ritardare la conferma del salvataggio');
});
