import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const component = readFileSync(join(ROOT, 'src/components/movimenti/MovimentoForm.vue'), 'utf8');
const layout = readFileSync(join(ROOT, 'src/components/layout/AppLayout.vue'), 'utf8');
const templateStart = component.indexOf('<template>') + '<template>'.length;
const template = component.slice(templateStart, component.lastIndexOf('</template>'));

test('la barra mobile usa colonne uguali e manda a capo le etichette strette', () => {
  assert.ok(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(layout), 'le cinque voci devono avere larghezze uguali');

  const labelStart = layout.indexOf('.bottom-nav__label {');
  const labelEnd = layout.indexOf('}', labelStart);
  const labelStyles = layout.slice(labelStart, labelEnd);
  assert.ok(/white-space:\s*normal/.test(labelStyles), 'le etichette devono poter occupare più righe');
  assert.ok(/overflow-wrap:\s*anywhere/.test(labelStyles), 'anche le parole senza spazi devono restare nella propria colonna');
});

test('il form Entrata/Uscita mostra sempre la descrizione, anche per i movimenti immediati', () => {
  const inputIndex = template.indexOf('v-model="form.descrizione"');
  assert.notEqual(inputIndex, -1, 'il campo deve raccogliere la descrizione');

  const fieldStart = template.lastIndexOf('<div', inputIndex);
  const fieldOpeningTag = template.slice(fieldStart, template.indexOf('>', fieldStart) + 1);
  const fieldMarkup = template.slice(fieldStart, template.indexOf('</div>', inputIndex) + '</div>'.length);

  assert.doesNotMatch(fieldOpeningTag, /\bv-if=/, 'la descrizione non deve dipendere dalla programmazione o dalla modifica');
  assert.match(fieldMarkup, /<label>Descrizione \(opzionale\)<\/label>/);
});

test('il salvataggio espone l’esito nel dialogo e mostra il toast dopo la chiusura', () => {
  const salvaStart = component.indexOf('const salva = async () => {');
  const salvaEnd = component.indexOf('const cambiaRicorrenza', salvaStart);
  const salva = component.slice(salvaStart, salvaEnd);
  const feedbackSuccessIndex = salva.indexOf("feedback.value = { type: 'success', message: messaggio }");
  const refreshIndex = salva.indexOf('await contiStore.refreshDopoScrittura(');
  const closeIndex = salva.indexOf("emit('close')");
  const toastIndex = salva.indexOf('toastStore.success(messaggio)');

  assert.ok(/v-if="feedback"[^>]*:role="feedback\.type === 'error' \? 'alert' : 'status'"/.test(template), 'l’esito deve essere annunciato con un ruolo accessibile');
  assert.notEqual(feedbackSuccessIndex, -1, 'il form deve confermare il successo mentre il dialogo è visibile');
  assert.notEqual(refreshIndex, -1, 'saldi e patrimonio devono continuare ad aggiornarsi');
  assert.ok(feedbackSuccessIndex < refreshIndex, 'l’esito interno deve comparire prima delle ricariche');
  assert.ok(refreshIndex < closeIndex && closeIndex < toastIndex, 'il toast globale deve partire dopo l’aggiornamento e la chiusura');

  const catchIndex = salva.indexOf('} catch (err) {');
  const catchEnd = salva.indexOf('} finally {', catchIndex);
  assert.ok(/feedback\.value = \{ type: 'error', message: extractErrorMessage\(err\) \}/.test(salva.slice(catchIndex, catchEnd)), 'gli errori devono rimanere visibili nel dialogo aperto');
});
