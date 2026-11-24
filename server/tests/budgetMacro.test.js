// Quale voce del budget conta un movimento: funzione pura, gira anche in
// `npm run test:unit`. Un caso per riga della tabella «Quale spesa va in
// quale voce» della spec del budget a tre voci.
const { voceDellaCategoria, contributoMovimento, aggregaPerVoce } = require('../services/budgetMacro');

const essenzialitaPerCategoria = new Map([
  ['supermercato', 'essenziale'],
  ['affitto', 'essenziale'],
  ['palestra', 'semi_essenziale'],
  ['ristoranti', 'discrezionale'],
  ['investimento', 'discrezionale'],
  ['deposito_scommesse', 'essenziale'], // finto: la voce fissa deve vincere anche così
]);
// I tipi veri dei conti (validation.middleware.js#CONTO_TIPI_CREATE), più
// 'emergenza' del fondo: 'investimenti' al plurale è solo l'id di un'icona.
const tipoConto = new Map([[1, 'banca'], [2, 'emergenza'], [3, 'risparmio'], [4, 'investimento'], [5, 'scommesse']]);
const contesto = { tipoConto, essenzialitaPerCategoria };

const uscita = (categoria, importo, extra = {}) => ({ id: 1, tipo: 'uscita', categoria, importo, conto_id: 1, ...extra });
const trasferimento = (da, a, importo, categoria = 'trasferimento') => ({
  id: 2, tipo: 'trasferimento', categoria, importo, conto_id: da, conto_destinazione_id: a, data: '2026-11-10', descrizione: 'Trasferimento',
});

describe('voceDellaCategoria', () => {
  it('essenziale è Bisogni', () => {
    expect(voceDellaCategoria('supermercato', essenzialitaPerCategoria)).toBe('bisogni');
  });
  it('semi_essenziale e discrezionale sono Desideri', () => {
    expect(voceDellaCategoria('palestra', essenzialitaPerCategoria)).toBe('desideri');
    expect(voceDellaCategoria('ristoranti', essenzialitaPerCategoria)).toBe('desideri');
  });
  it('una categoria sconosciuta è Desideri', () => {
    expect(voceDellaCategoria('custom_42', essenzialitaPerCategoria)).toBe('desideri');
  });
  it('le voci fisse vincono sull’essenzialità', () => {
    expect(voceDellaCategoria('investimento', essenzialitaPerCategoria)).toBe('futuro');
    expect(voceDellaCategoria('trading', new Map([['trading', 'semi_essenziale']]))).toBe('futuro');
    expect(voceDellaCategoria('deposito_scommesse', essenzialitaPerCategoria)).toBe('desideri');
  });
});

describe('contributoMovimento', () => {
  it('supermercato (essenziale) è Bisogni', () => {
    expect(contributoMovimento(uscita('supermercato', '40.10'), contesto)).toEqual({ voce: 'bisogni', centesimi: 4010 });
  });
  it('palestra (semi_essenziale) è Desideri', () => {
    expect(contributoMovimento(uscita('palestra', 35), contesto)).toEqual({ voce: 'desideri', centesimi: 3500 });
  });
  it('una categoria sconosciuta è Desideri', () => {
    expect(contributoMovimento(uscita('custom_42', 12), contesto)).toEqual({ voce: 'desideri', centesimi: 1200 });
  });
  it('un’uscita senza categoria è Desideri', () => {
    expect(contributoMovimento(uscita(null, 5), contesto)).toEqual({ voce: 'desideri', centesimi: 500 });
  });
  it('l’uscita Investimenti è Futuro anche se il catalogo la dice discrezionale', () => {
    expect(contributoMovimento(uscita('investimento', 100), contesto)).toEqual({ voce: 'futuro', centesimi: 10000 });
  });
  it('il trasferimento verso il fondo vale +', () => {
    expect(contributoMovimento(trasferimento(1, 2, 150), contesto)).toEqual({ voce: 'futuro', centesimi: 15000 });
  });
  it('il trasferimento verso un conto investimento vale +', () => {
    expect(contributoMovimento(trasferimento(1, 4, 75), contesto)).toEqual({ voce: 'futuro', centesimi: 7500 });
  });
  it('dal conto risparmio al conto investimento non conta: il denaro resta nel Futuro', () => {
    expect(contributoMovimento(trasferimento(3, 4, 300), contesto)).toBeNull();
  });
  it('un versamento in investimenti dal conto risparmio non conta una seconda volta', () => {
    expect(contributoMovimento(uscita('investimento', 500, { conto_id: 3 }), contesto)).toBeNull();
  });
  it('un acquisto su un broker (trading) è Futuro', () => {
    expect(contributoMovimento(uscita('trading', 200), contesto)).toEqual({ voce: 'futuro', centesimi: 20000 });
  });
  it('il ritorno dal conto risparmio vale −', () => {
    expect(contributoMovimento(trasferimento(3, 1, 150), contesto)).toEqual({ voce: 'futuro', centesimi: -15000 });
  });
  it('fra due conti di risparmio non conta', () => {
    expect(contributoMovimento(trasferimento(3, 2, 150), contesto)).toBeNull();
  });
  it('fra due conti normali non conta', () => {
    expect(contributoMovimento(trasferimento(1, 99, 150), contesto)).toBeNull();
  });
  it('il deposito scommesse è Desideri', () => {
    expect(contributoMovimento(trasferimento(1, 5, 50, 'deposito_scommesse'), contesto)).toEqual({ voce: 'desideri', centesimi: 5000 });
  });
  it('un prelievo dalle scommesse non conta', () => {
    expect(contributoMovimento(trasferimento(5, 1, 50, 'prelievo_scommesse'), contesto)).toBeNull();
  });
  it('un bonifico (trasferimento_denaro) non è in nessuna voce: è da attribuire', () => {
    expect(contributoMovimento(uscita('trasferimento_denaro', 500), contesto)).toEqual({ voce: 'da_attribuire', centesimi: 50000 });
  });
  it('un’entrata non conta', () => {
    expect(contributoMovimento({ id: 9, tipo: 'entrata', categoria: 'stipendio', importo: 2000, conto_id: 1 }, contesto)).toBeNull();
  });
});

describe('aggregaPerVoce', () => {
  it('somma per categoria e tiene l’elenco del Futuro', () => {
    const esito = aggregaPerVoce([
      uscita('supermercato', 40),
      uscita('supermercato', 20),
      uscita('ristoranti', 30),
      trasferimento(1, 2, 150),
      trasferimento(3, 1, 50),
      { id: 9, tipo: 'entrata', categoria: 'stipendio', importo: 2000, conto_id: 1 },
    ], contesto);

    expect(esito.bisogni.centesimi).toBe(6000);
    expect(esito.bisogni.perCategoria.get('supermercato')).toBe(6000);
    expect(esito.desideri.centesimi).toBe(3000);
    expect(esito.desideri.perCategoria.get('ristoranti')).toBe(3000);
    expect(esito.futuro.centesimi).toBe(10000);
    expect(esito.futuro.movimenti.map((m) => m.centesimi)).toEqual([15000, -5000]);
    // conto_id è il conto dal lato del Futuro (dove il denaro è stato messo da
    // parte o da cui è stato tolto): è quello che l'elenco deve nominare.
    expect(esito.futuro.movimenti[0]).toEqual({
      id: 2, data: '2026-11-10', descrizione: 'Trasferimento', centesimi: 15000, conto_id: 2,
    });
    expect(esito.futuro.movimenti[1].conto_id).toBe(3);
  });

  it('i bonifici si sommano a parte, fuori dalle tre voci', () => {
    const esito = aggregaPerVoce([
      uscita('ristoranti', 30),
      { ...uscita('trasferimento_denaro', 500), id: 7, data: '2026-11-05', descrizione: 'Bonifico a conto deposito' },
    ], contesto);
    expect(esito.desideri.centesimi).toBe(3000);
    expect(esito.da_attribuire.centesimi).toBe(50000);
    expect(esito.da_attribuire.movimenti).toEqual([
      { id: 7, data: '2026-11-05', descrizione: 'Bonifico a conto deposito', centesimi: 50000, conto_id: 1 },
    ]);
  });

  it('senza movimenti tutte le voci sono a zero', () => {
    const esito = aggregaPerVoce([], contesto);
    expect(esito.bisogni.centesimi).toBe(0);
    expect(esito.desideri.perCategoria.size).toBe(0);
    expect(esito.futuro.movimenti).toEqual([]);
  });
});
