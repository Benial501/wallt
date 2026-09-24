/**
 * Il contratto di Piano Smart fra client e server, verificato confrontando i
 * due file di vocabolario invece di fidarsi che restino allineati.
 *
 * Nasce da un difetto reale trovato in integrazione: la view mandava al
 * backend le etichette dell'interfaccia (`sourceType: 'Regalo'`,
 * `status: 'completato'`) e ogni chiamata tornava 400. Nessun test lo vedeva,
 * perché i due lati erano testati separatamente.
 *
 * Importa direttamente `server/constants/pianoSmart.js`: se qualcuno cambia un
 * enum da una parte sola, qui si rompe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import serverConstants from '../../server/constants/pianoSmart.js';
import {
  CATEGORIE_PIANO, ORIGINI_SOMMA, STATI_PIANO, TRANSIZIONI_STATO, CATEGORIA_CONCETTO,
  importoInCentesimi, centesimiInImporto, formattaEuro,
} from '../src/utils/pianoSmart.js';
import { GLOSSARIO } from '../src/content/glossario.js';

test('le cinque categorie coincidono con quelle del backend, nello stesso ordine', () => {
  assert.deepEqual([...CATEGORIE_PIANO], [...serverConstants.CATEGORIE]);
});

test('le origini inviate al backend sono esattamente quelle ammesse', () => {
  const valoriClient = ORIGINI_SOMMA.map((o) => o.value).sort();
  assert.deepEqual(valoriClient, [...serverConstants.SOURCE_TYPES].sort());
});

test('ogni origine ha una etichetta leggibile diversa dal valore API', () => {
  ORIGINI_SOMMA.forEach((origine) => {
    assert.ok(origine.label && origine.label !== origine.value, `origine senza etichetta: ${origine.value}`);
  });
});

test('gli stati del piano coincidono con quelli del backend', () => {
  assert.deepEqual(Object.keys(STATI_PIANO).sort(), [...serverConstants.STATI_PIANO].sort());
});

test('le transizioni di stato rispecchiano quelle del backend', () => {
  assert.deepEqual(TRANSIZIONI_STATO, serverConstants.TRANSIZIONI_STATO);
});

test('archived resta terminale', () => {
  assert.deepEqual(TRANSIZIONI_STATO.archived, []);
});

test('ogni categoria ha un concetto nel glossario, mai una etichetta in linea', () => {
  CATEGORIE_PIANO.forEach((categoria) => {
    const concetto = GLOSSARIO[CATEGORIA_CONCETTO[categoria]];
    assert.ok(concetto, `categoria senza concetto nel glossario: ${categoria}`);
    assert.ok(concetto.etichetta.length > 0);
    assert.ok(concetto.descrizione.length > 0);
  });
});

test('le cinque etichette sono quelle che il prodotto promette', () => {
  const etichette = CATEGORIE_PIANO.map((c) => GLOSSARIO[CATEGORIA_CONCETTO[c]].etichetta);
  assert.deepEqual(etichette, ['Necessità', 'Sicurezza', 'Obiettivi', 'Futuro', 'Libertà']);
});

test('gli importi dell API si convertono in centesimi senza perdita', () => {
  const casi = [
    ['0.01', 1], ['0.10', 10], ['1.99', 199], ['100.00', 10000],
    ['800.00', 80000], ['10000.00', 1000000], ['0.00', 0],
  ];
  casi.forEach(([stringa, centesimi]) => {
    assert.equal(importoInCentesimi(stringa), centesimi, `conversione errata per ${stringa}`);
    assert.equal(centesimiInImporto(centesimi), stringa.replace(/^(\d+)\.(\d)$/, '$1.$20'));
  });
});

test('la virgola decimale italiana viene accettata', () => {
  assert.equal(importoInCentesimi('1,99'), 199);
});

test('il round-trip centesimi non perde mai un centesimo', () => {
  for (let c = 0; c <= 2000; c += 1) {
    assert.equal(importoInCentesimi(centesimiInImporto(c)), c);
  }
});

test('un importo assente non diventa zero', () => {
  assert.equal(importoInCentesimi(null), null);
  assert.equal(importoInCentesimi(''), null);
  assert.equal(importoInCentesimi('abc'), null);
  assert.equal(formattaEuro(null), '—');
});

test('la somma di cinque quote decimali torna esatta in centesimi', () => {
  // Il caso che con i float si discosta: 0.1 + 0.2 !== 0.3
  const quote = ['0.10', '0.20', '0.30', '0.15', '0.25'];
  const somma = quote.reduce((s, q) => s + importoInCentesimi(q), 0);
  assert.equal(somma, importoInCentesimi('1.00'));
});

test('lo store di Piano Smart viene azzerato al logout', () => {
  // Un piano contiene il riepilogo finanziario dell utente: se lo store non
  // viene resettato, il login successivo sulla stessa scheda lo mostrerebbe
  // a un altro utente.
  const session = readFileSync(new URL('../src/utils/session.js', import.meta.url), 'utf8');
  assert.match(session, /usePianoSmartStore/, 'pianoSmart.store non è in resetPiniaStores');
});

test('la view non manda etichette al posto dei valori API', () => {
  const view = readFileSync(new URL('../src/views/PianoSmartView.vue', import.meta.url), 'utf8');
  // Le etichette con la maiuscola non devono comparire come valori di option.
  assert.doesNotMatch(view, /:value="'Regalo'"|value="Regalo"/);
  assert.doesNotMatch(view, /'completato'|'archiviato'/, 'stati in italiano inviati al backend');
  assert.match(view, /ORIGINI_SOMMA/, 'la view deve usare il vocabolario condiviso');
});
