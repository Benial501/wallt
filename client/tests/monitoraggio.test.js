import test from 'node:test';
import assert from 'node:assert/strict';
import { rimuoviDatiFinanziari, ripulisciUrl } from '../src/utils/monitoraggio.js';

/**
 * Un report d'errore esce da WALLT come una notifica push: la Regola 17 dice
 * che importi, saldi e categorie non possono uscire. Queste prove servono a
 * quella promessa, non alla forma del filtro.
 */

test('gli importi spariscono dal testo di un messaggio d’errore', () => {
  const evento = {
    message: 'Saldo insufficiente: disponibili 1250,50 €',
  };
  const pulito = rimuoviDatiFinanziari(evento);
  assert.doesNotMatch(pulito.message, /1250|250,50/);
  assert.match(pulito.message, /Saldo insufficiente/, 'il motivo dell’errore resta leggibile');
});

test('gli importi spariscono in tutte le forme che l’app produce', () => {
  for (const scritto of ['1250,50 €', '€1250.50', '1.250,50', '-89,90 €', '12,00 EUR']) {
    const pulito = rimuoviDatiFinanziari({ testo: `valore ${scritto} qui` });
    assert.doesNotMatch(pulito.testo, /\d/, `non ripulito: ${scritto}`);
  }
});

test('i campi sensibili spariscono anche quando non somigliano a un importo', () => {
  const evento = {
    extra: {
      movimento: { importo: 42, descrizione: 'Bonifico a Mario', categoria: 'affitto' },
      conto: { nome: 'Postepay', saldo: '1000' },
    },
  };
  const pulito = rimuoviDatiFinanziari(evento);
  assert.equal(pulito.extra.movimento.importo, '[rimosso]');
  assert.equal(pulito.extra.movimento.descrizione, '[rimosso]');
  assert.equal(pulito.extra.movimento.categoria, '[rimosso]');
  assert.equal(pulito.extra.conto.saldo, '[rimosso]');
  assert.equal(pulito.extra.conto.nome, 'Postepay', 'il nome del conto non e’ un dato finanziario');
});

test('email e credenziali non escono', () => {
  const pulito = rimuoviDatiFinanziari({
    user: { email: 'tizio@example.com', id: 42 },
    request: { token: 'eyJhbGciOi...', password: 'segreta' },
  });
  assert.equal(pulito.user.email, '[rimosso]');
  assert.equal(pulito.request.token, '[rimosso]');
  assert.equal(pulito.request.password, '[rimosso]');
  assert.equal(pulito.user.id, 42, 'l’id tecnico resta: serve a contare quanti utenti colpisce');
});

/**
 * Il caso meno ovvio e quello che una lista di campi non prenderebbe mai:
 * Sentry registra da solo l'etichetta dell'elemento cliccato, e in WALLT
 * quell'etichetta e' spesso un saldo.
 */
test('un importo dentro un breadcrumb automatico non passa', () => {
  const evento = {
    breadcrumbs: [
      { category: 'ui.click', message: 'button[aria-label="Postepay — 1250,50 €"]' },
      { category: 'xhr', data: { url: '/api/movimenti?importo_min=100,00&q=affitto' } },
    ],
  };
  const pulito = rimuoviDatiFinanziari(evento);
  assert.doesNotMatch(pulito.breadcrumbs[0].message, /1250|250,50/);
  assert.doesNotMatch(pulito.breadcrumbs[1].data.url, /100,00/);
});

test('la query string sparisce dagli url, il percorso resta', () => {
  assert.equal(ripulisciUrl('/api/movimenti?importo_min=100&q=mario'), '/api/movimenti?[rimossa]');
  assert.equal(ripulisciUrl('/api/conti'), '/api/conti');
});

test('le strutture ricorsive non mandano in loop il filtro', () => {
  const ciclico = { nome: 'x' };
  ciclico.se_stesso = ciclico;
  assert.doesNotThrow(() => rimuoviDatiFinanziari(ciclico));
});
