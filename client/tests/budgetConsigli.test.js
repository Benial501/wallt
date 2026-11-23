/**
 * Le frasi del consulente del budget e la scelta dell'essenzialità quando
 * l'utente sposta una categoria fra Bisogni e Desideri. Il server manda solo
 * il codice e i numeri (services/budgetConsiglio.js): il testo è qui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fraseConsiglio } from '../src/content/budgetConsigli.js';
import { essenzialitaPerSpostamento } from '../src/utils/budget.js';

// Stesso formato di utils/formatters.js#formatValuta, che qui non si può
// importare perché carica dayjs.
const formatValuta = (n) => new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n);
const nomi = { ristoranti: 'Ristoranti', delivery: 'Delivery', svago: 'Svago' };
const nomeCategoria = (id) => nomi[id] || id;
const opzioni = { formatValuta, nomeCategoria };

test('desideri oltre nomina le due categorie più pesanti', () => {
  assert.equal(
    fraseConsiglio({ codice: 'desideri_oltre', dati: { eccedenza: 40, categorie: ['ristoranti', 'delivery'] } }, opzioni),
    `Hai superato i Desideri di ${formatValuta(40)}: pesano di più Ristoranti e Delivery.`,
  );
});

test('desideri oltre con una sola categoria', () => {
  assert.equal(
    fraseConsiglio({ codice: 'desideri_oltre', dati: { eccedenza: 12.5, categorie: ['svago'] } }, opzioni),
    `Hai superato i Desideri di ${formatValuta(12.5)}: pesa di più Svago.`,
  );
});

test('futuro indietro rimanda a Piano Smart', () => {
  assert.equal(
    fraseConsiglio({ codice: 'futuro_indietro', dati: { mancante: 250 } }, opzioni),
    `Mancano ${formatValuta(250)} per il Futuro: spostali sul conto risparmio. Piano Smart ti dice dove.`,
  );
});

test('in regola dice quanto resta e per quanti giorni', () => {
  assert.equal(
    fraseConsiglio({ codice: 'in_regola', dati: { restante_desideri: 180, giorni: 7 } }, opzioni),
    `Sei in linea: restano ${formatValuta(180)} di Desideri per 7 giorni.`,
  );
});

test('in regola nell’ultimo giorno del mese', () => {
  assert.equal(
    fraseConsiglio({ codice: 'in_regola', dati: { restante_desideri: 30, giorni: 0 } }, opzioni),
    `Sei in linea: restano ${formatValuta(30)} di Desideri fino a fine mese.`,
  );
});

test('in regola con un giorno solo usa il singolare', () => {
  assert.equal(
    fraseConsiglio({ codice: 'in_regola', dati: { restante_desideri: 30, giorni: 1 } }, opzioni),
    `Sei in linea: restano ${formatValuta(30)} di Desideri per 1 giorno.`,
  );
});

test('bisogni oltre senza suggerimento', () => {
  assert.equal(
    fraseConsiglio({ codice: 'bisogni_oltre', dati: { eccedenza: 120, suggerisci_modello: null } }, opzioni),
    `I Bisogni hanno superato l'obiettivo di ${formatValuta(120)}: la differenza va tolta dai Desideri.`,
  );
});

test('bisogni oltre con suggerimento di cambio modello', () => {
  assert.equal(
    fraseConsiglio({ codice: 'bisogni_oltre', dati: { eccedenza: 120, suggerisci_modello: 'spese_fisse_alte' } }, opzioni),
    `I Bisogni hanno superato l'obiettivo di ${formatValuta(120)}: la differenza va tolta dai Desideri. Il modello 70/20/10 potrebbe adattarsi meglio a te.`,
  );
});

test('entrata mancante invita a indicarla', () => {
  assert.equal(
    fraseConsiglio({ codice: 'entrata_mancante', dati: {} }, opzioni),
    'Indica la tua entrata mensile per vedere come dividerla.',
  );
});

test('un codice sconosciuto non produce una frase', () => {
  assert.equal(fraseConsiglio({ codice: 'altro', dati: {} }, opzioni), '');
  assert.equal(fraseConsiglio(null, opzioni), '');
});

test('predefinita semi-essenziale verso i Desideri torna al catalogo', () => {
  assert.equal(essenzialitaPerSpostamento({ predefinita: true, essenzialita_catalogo: 'semi_essenziale' }, 'desideri'), null);
});

test('predefinita essenziale verso i Desideri diventa discrezionale', () => {
  assert.equal(essenzialitaPerSpostamento({ predefinita: true, essenzialita_catalogo: 'essenziale' }, 'desideri'), 'discrezionale');
});

test('personale verso i Desideri diventa discrezionale', () => {
  assert.equal(essenzialitaPerSpostamento({ predefinita: false, essenzialita_catalogo: null }, 'desideri'), 'discrezionale');
});

test('personale verso i Bisogni diventa essenziale', () => {
  assert.equal(essenzialitaPerSpostamento({ predefinita: false, essenzialita_catalogo: null }, 'bisogni'), 'essenziale');
});

test('predefinita essenziale riportata nei Bisogni torna al catalogo', () => {
  assert.equal(essenzialitaPerSpostamento({ predefinita: true, essenzialita_catalogo: 'essenziale' }, 'bisogni'), null);
});
