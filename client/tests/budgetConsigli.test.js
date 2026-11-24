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

test('ogni modello ha un nome e una riga che dice per chi è', async () => {
  const { NOMI_MODELLI, DESCRIZIONI_MODELLI } = await import('../src/content/budgetConsigli.js');
  const { MODELLI_IDS } = await import('../src/utils/budget.js');
  MODELLI_IDS.forEach((id) => {
    assert.ok(NOMI_MODELLI[id], id);
    assert.ok(DESCRIZIONI_MODELLI[id], id);
  });
  assert.equal(NOMI_MODELLI.equilibrato, 'Equilibrato');
  assert.equal(NOMI_MODELLI.spese_fisse_alte, 'Spese fisse alte');
});

test('il motivo del consiglio cita la quota delle spese fisse', async () => {
  const { fraseMotivoModello } = await import('../src/content/budgetConsigli.js');
  assert.equal(
    fraseMotivoModello({ codice: 'equilibrato', quota_spese_fisse: 0.31 }),
    'Le spese fisse che hai indicato valgono il 31% della tua entrata: puoi permetterti il modello più classico.',
  );
  assert.equal(
    fraseMotivoModello({ codice: 'spese_fisse_alte', quota_spese_fisse: 0.41 }),
    'Le spese fisse che hai indicato valgono il 41% della tua entrata: ai Bisogni serve più spazio.',
  );
  assert.equal(
    fraseMotivoModello({ codice: 'vive_con_genitori', quota_spese_fisse: null }),
    'Vivi con i tuoi genitori e hai poche spese fisse: puoi mettere da parte di più.',
  );
  assert.equal(
    fraseMotivoModello({ codice: 'senza_entrata', quota_spese_fisse: null }),
    'È il modello più classico: un buon punto di partenza.',
  );
  assert.equal(fraseMotivoModello(null), '');
});

test('descriviVoce: Bisogni sotto l’obiettivo', async () => {
  const { descriviVoce } = await import('../src/content/budgetConsigli.js');
  assert.deepEqual(
    descriviVoce('bisogni', { obiettivo: 1000, usato: 780, restante: 220, percentuale_usata: 78 }, { formatValuta }),
    { nota: `Restano ${formatValuta(220)}`, oltre: false, larghezza: 78, mostraObiettivo: true },
  );
});

test('descriviVoce: Desideri oltre l’obiettivo', async () => {
  const { descriviVoce } = await import('../src/content/budgetConsigli.js');
  const d = descriviVoce('desideri', { obiettivo: 600, usato: 640, restante: -40, percentuale_usata: 107 }, { formatValuta });
  assert.equal(d.nota, `Superato di ${formatValuta(40)}`);
  assert.equal(d.oltre, true);
  assert.equal(d.larghezza, 100);
});

test('descriviVoce: il Futuro non è mai «superato»', async () => {
  const { descriviVoce } = await import('../src/content/budgetConsigli.js');
  assert.equal(descriviVoce('futuro', { obiettivo: 400, usato: 150, restante: 250, percentuale_usata: 38 }, { formatValuta }).nota, `Mancano ${formatValuta(250)}`);
  const pieno = descriviVoce('futuro', { obiettivo: 400, usato: 500, restante: -100, percentuale_usata: 125 }, { formatValuta });
  assert.equal(pieno.nota, 'Obiettivo raggiunto');
  assert.equal(pieno.oltre, false);
});

test('descriviVoce: senza entrata niente obiettivo, niente «Superato»', async () => {
  const { descriviVoce } = await import('../src/content/budgetConsigli.js');
  const bisogni = descriviVoce('bisogni', { obiettivo: 0, usato: 80, restante: -80, percentuale_usata: 0 }, { formatValuta, entrataMancante: true });
  assert.deepEqual(bisogni, { nota: `${formatValuta(80)} spesi questo mese`, oltre: false, larghezza: 0, mostraObiettivo: false });
  const futuro = descriviVoce('futuro', { obiettivo: 0, usato: 150, restante: -150, percentuale_usata: 0 }, { formatValuta, entrataMancante: true });
  assert.equal(futuro.nota, `${formatValuta(150)} messi da parte questo mese`);
  assert.equal(futuro.mostraObiettivo, false);
});
