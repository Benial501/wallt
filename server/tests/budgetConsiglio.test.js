// La frase del consulente del budget: funzione pura, gira anche in
// `npm run test:unit`. Importi in centesimi, come li passa lo stato del mese.
const { scegliConsiglio } = require('../services/budgetConsiglio');

// La situazione della bozza approvata: 2.000 € con 50/30/20, Desideri oltre
// di 40 € e Futuro indietro.
const base = () => ({
  entrataCentesimi: 200000,
  modello: 'equilibrato',
  giorniRimanenti: 7,
  bisogniOltreDaTreMesi: false,
  voci: {
    bisogni: { obiettivo: 100000, usato: 78000 },
    desideri: {
      obiettivo: 60000,
      usato: 64000,
      perCategoria: new Map([['shopping_online', 16000], ['ristoranti', 30000], ['delivery', 18000]]),
    },
    futuro: { obiettivo: 40000, usato: 15000 },
  },
});

const con = (modifica) => {
  const input = base();
  modifica(input);
  return input;
};

describe('scegliConsiglio', () => {
  it('desideri oltre: eccedenza e le due categorie più pesanti', () => {
    expect(scegliConsiglio(base())).toEqual({
      codice: 'desideri_oltre',
      dati: { eccedenza: 4000, categorie: ['ristoranti', 'delivery'] },
    });
  });

  it('desideri oltre con una sola categoria la nomina da sola', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.desideri.perCategoria = new Map([['svago', 64000]]); }));
    expect(esito.dati.categorie).toEqual(['svago']);
  });

  it('bisogni oltre vince sui desideri', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.bisogni.usato = 112000; }));
    expect(esito).toEqual({ codice: 'bisogni_oltre', dati: { eccedenza: 12000, suggerisci_modello: null } });
  });

  it('bisogni oltre da tre mesi con Equilibrato suggerisce 70/20/10', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.bisogni.usato = 112000; i.bisogniOltreDaTreMesi = true; }));
    expect(esito.dati.suggerisci_modello).toBe('spese_fisse_alte');
  });

  it('bisogni oltre da tre mesi con Risparmio deciso suggerisce Equilibrato', () => {
    const esito = scegliConsiglio(con((i) => {
      i.voci.bisogni.usato = 112000; i.bisogniOltreDaTreMesi = true; i.modello = 'risparmio_deciso';
    }));
    expect(esito.dati.suggerisci_modello).toBe('equilibrato');
  });

  it('bisogni oltre senza tre mesi non suggerisce', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.bisogni.usato = 112000; i.bisogniOltreDaTreMesi = false; }));
    expect(esito.dati.suggerisci_modello).toBeNull();
  });

  it('con personalizzato non suggerisce mai', () => {
    const esito = scegliConsiglio(con((i) => {
      i.voci.bisogni.usato = 112000; i.bisogniOltreDaTreMesi = true; i.modello = 'personalizzato';
    }));
    expect(esito.dati.suggerisci_modello).toBeNull();
  });

  it('con Spese fisse alte non suggerisce', () => {
    const esito = scegliConsiglio(con((i) => {
      i.voci.bisogni.usato = 152000; i.voci.bisogni.obiettivo = 140000; i.bisogniOltreDaTreMesi = true; i.modello = 'spese_fisse_alte';
    }));
    expect(esito.dati.suggerisci_modello).toBeNull();
  });

  it('futuro indietro quando le spese sono in regola', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.desideri.usato = 50000; }));
    expect(esito).toEqual({ codice: 'futuro_indietro', dati: { mancante: 25000 } });
  });

  it('un Futuro negativo (prelievi) conta come mancante pieno più il prelievo', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.desideri.usato = 50000; i.voci.futuro.usato = -5000; }));
    expect(esito.dati.mancante).toBe(45000);
  });

  it('in regola: restante dei desideri e giorni', () => {
    const esito = scegliConsiglio(con((i) => { i.voci.desideri.usato = 42000; i.voci.futuro.usato = 40000; }));
    expect(esito).toEqual({ codice: 'in_regola', dati: { restante_desideri: 18000, giorni: 7 } });
  });

  it('Futuro allo 0% con il resto in regola dà in_regola', () => {
    const esito = scegliConsiglio(con((i) => {
      i.modello = 'personalizzato';
      i.voci.desideri.usato = 42000;
      i.voci.futuro = { obiettivo: 0, usato: 0 };
    }));
    expect(esito.codice).toBe('in_regola');
  });

  it('entrata 0 vince su tutto', () => {
    const esito = scegliConsiglio(con((i) => { i.entrataCentesimi = 0; i.voci.bisogni.usato = 999999; }));
    expect(esito).toEqual({ codice: 'entrata_mancante', dati: {} });
  });
});
