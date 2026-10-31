import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSfc } from './helpers/renderVue.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const leggi = (percorso) => readFileSync(join(SRC, percorso), 'utf8');
const CARD = '/src/components/abbonamenti/AbbonamentoCard.vue';
const TOTALI = '/src/components/abbonamenti/AbbonamentiTotali.vue';
const FORM = '/src/components/abbonamenti/AbbonamentoForm.vue';

const abbonamento = (altro = {}) => ({
  id: 1,
  servizio_id: 'netflix',
  icona: 'netflix',
  nome: 'Netflix',
  costo: 13.99,
  periodo_mesi: 1,
  durata_mesi: null,
  data_inizio: null,
  data_fine: null,
  stato_effettivo: 'attivo',
  origine: 'manuale',
  da_verificare: false,
  riattivato_da_addebito: false,
  annullato_il: null,
  ultimo_addebito_data: null,
  ultimo_addebito_importo: null,
  movimento_ricorrente_id: null,
  costi: {
    al_mese: 13.99, in_un_anno: 167.88, in_totale: null, peso_annuo: 167.88,
  },
  ...altro,
});

const aTempo = () => abbonamento({
  nome: 'Spotify',
  icona: 'spotify',
  costo: 10.99,
  durata_mesi: 3,
  data_inizio: '2026-10-01',
  costi: {
    al_mese: 10.99, in_un_anno: 131.88, in_totale: 32.97, peso_annuo: 32.97,
  },
});

test('la scheda senza scadenza mostra costo, durata e costo annuo', async () => {
  const html = await renderSfc(CARD, { abbonamento: abbonamento() });
  ['Netflix', '13,99', 'Durata', 'Ogni mese', 'All’anno', '167,88'].forEach((testo) => assert.ok(html.includes(testo), testo));
  assert.ok(!html.includes('In totale'));
  assert.ok(!html.includes('Controlla la durata'));
});

test('la scheda a tempo mostra il totale del periodo e quanto costerebbe in un anno', async () => {
  const html = await renderSfc(CARD, { abbonamento: aTempo() });
  ['3 mesi', 'In totale', '32,97', 'In un anno', '131,88'].forEach((testo) => assert.ok(html.includes(testo), testo));
  assert.ok(!html.includes('All’anno'));
});

test('la scheda è attivabile da tastiera', async () => {
  const html = await renderSfc(CARD, { abbonamento: abbonamento() });
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-label="[^"]*Netflix[^"]*"/);
});

test('la scheda avvisa quando la durata è da controllare', async () => {
  const html = await renderSfc(CARD, { abbonamento: abbonamento({ da_verificare: true }) });
  assert.ok(html.includes('Controlla la durata'));
});

test('la scheda racconta un addebito arrivato dopo la chiusura', async () => {
  const html = await renderSfc(CARD, {
    abbonamento: abbonamento({ riattivato_da_addebito: true, annullato_il: '2026-10-01', ultimo_addebito_data: '2026-10-12' }),
  });
  assert.ok(html.includes('addebitato di nuovo'));
  assert.ok(html.includes('Chiuso il'));
});

test('i totali mostrano mese e anno, con la nota solo se c\'è un abbonamento a tempo', async () => {
  const conNota = await renderSfc(TOTALI, { totali: { al_mese: 70.14, all_anno: 742.75, se_tutti_12_mesi: 841.66 } });
  ['Quanto spendi in abbonamenti', 'Al mese', '70,14', 'All’anno', '742,75', '841,66'].forEach((testo) => assert.ok(conNota.includes(testo), testo));

  const senzaNota = await renderSfc(TOTALI, { totali: { al_mese: 13.99, all_anno: 167.88, se_tutti_12_mesi: null } });
  assert.ok(!senzaNota.includes('durassero'));
});

test('il modulo nuovo propone i servizi per gruppo e fa il conto', async () => {
  const html = await renderSfc(FORM, { abbonamento: null });
  ['Video', 'Musica', 'Intelligenza artificiale', 'Netflix', 'ChatGPT', 'Claude', 'Palestra', 'Si paga ogni', 'Quanto dura', 'Finché non lo annullo', 'Salva abbonamento'].forEach((testo) => assert.ok(html.includes(testo), testo));
  assert.ok(!html.includes('Annulla abbonamento'));
  assert.ok(!html.includes('Non è un abbonamento'));
});

test('in modifica si può annullare, e fa già il conto', async () => {
  const html = await renderSfc(FORM, { abbonamento: abbonamento() });
  ['Salva modifiche', 'Annulla abbonamento', 'Ti costa', '167,88'].forEach((testo) => assert.ok(html.includes(testo), testo));
  assert.ok(!html.includes('Non è un abbonamento'), 'solo per quelli trovati nelle transazioni');
});

test('il modulo a tempo chiede i mesi e mostra totale e anno', async () => {
  const html = await renderSfc(FORM, { abbonamento: aTempo() });
  ['Per quanti mesi', 'Dal', '32,97', 'In un anno sarebbero', '131,88'].forEach((testo) => assert.ok(html.includes(testo), testo));
});

test('un abbonamento trovato nelle transazioni mostra l\'addebito e si può escludere', async () => {
  const html = await renderSfc(FORM, {
    abbonamento: abbonamento({
      origine: 'rilevato', da_verificare: true, ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: 18,
    }),
  });
  ['Trovato nelle tue transazioni', '18,00', 'Non è un abbonamento', 'durata'].forEach((testo) => assert.ok(html.includes(testo), testo));
});

test('il modulo avvisa quando l\'abbonamento è legato a una programmazione', async () => {
  const senza = await renderSfc(FORM, { abbonamento: abbonamento() });
  assert.ok(!senza.includes('Vai a Programmate'));

  const legato = await renderSfc(FORM, { abbonamento: abbonamento({ movimento_ricorrente_id: 50 }) });
  ['programmazione', 'non ferma', 'Vai a Programmate'].forEach((testo) => assert.ok(legato.includes(testo), testo));
});

test('la sezione usa DataState con lo stato vuoto nel suo slot', () => {
  const sezione = leggi('components/abbonamenti/AbbonamentiSezione.vue');
  assert.match(sezione, /<DataState/);
  assert.match(sezione, /#vuoto/);
  assert.match(sezione, /\+ Aggiungi/);
  assert.match(sezione, /Mostra annullati/);
  assert.match(sezione, /Ripristina/);
});

test('lo store legge da creaRisorsa e il logout lo azzera', () => {
  const store = leggi('stores/abbonamenti.store.js');
  assert.match(store, /creaRisorsa/);
  assert.match(store, /api\.get\('\/abbonamenti'\)/);
  assert.match(leggi('utils/session.js'), /useAbbonamentiStore/);
});

test('la vista ha le due schede, il titolo nuovo e la scheda nell\'indirizzo', () => {
  const vista = leggi('views/RicorrentiView.vue');
  assert.match(vista, /<h1>Programmate \/ Abbonamenti<\/h1>/);
  assert.match(vista, /role="tablist"/);
  assert.match(vista, /role="tab"/);
  assert.match(vista, /AbbonamentiSezione/);
  assert.match(vista, /scheda/);
  assert.match(vista, /decidiAsse/);
  assert.match(vista, /touch-action: pan-y/);
  assert.match(vista, /abbonamenti-gestione/);
});
