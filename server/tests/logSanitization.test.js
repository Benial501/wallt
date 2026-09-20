// I nuovi campi finanziari introdotti dal Financial Foundation non devono mai
// comparire in chiaro nei log: FINANCIAL_KEYS è una redazione ricorsiva per
// chiave, applicata a ogni oggetto passato a logger.*.
const { sanitizeMeta } = require('../utils/logger');

describe('Sanitizzazione log — nuovi campi finanziari', () => {
  const NUOVE_CHIAVI = [
    'liquidita_libera',
    'liquidita_allocata',
    'saldo_conti',
    'impegni_pertinenti',
    'patrimonio_netto',
    'passivita',
    'passivita_totale',
    'saldo_residuo',
    'rata_periodica',
    'rata',
    'tasso_interesse',
    'taeg',
    'importo_fondo',
    'spese_essenziali_mensili',
    'mesi_copertura',
    'totale_conti',
    'totale_investimenti',
    'patrimonio_conti',
    'patrimonio_investimenti',
    'patrimonio_investito_totale',
  ];

  it.each(NUOVE_CHIAVI)(
    'redige %s quando compare come chiave di un oggetto sanitizzato',
    (chiave) => {
      const sensibile = { [chiave]: 12345.67 };
      const sanitizzato = sanitizeMeta(sensibile);
      expect(sanitizzato[chiave]).toBe('[REDACTED]');
      expect(JSON.stringify(sanitizzato)).not.toContain('12345.67');
    }
  );

  it('redige i nuovi campi in oggetti annidati', () => {
    const sensibile = {
      utente: {
        nome: 'Mario',
        patrimonio_netto: 50000,
      },
      movimenti: [
        { id: 1, importo: 100, rata: 500 },
        { id: 2, importo: 200, liquidita_libera: 1000 },
      ],
    };
    const sanitizzato = sanitizeMeta(sensibile);
    expect(sanitizzato.utente.patrimonio_netto).toBe('[REDACTED]');
    expect(sanitizzato.movimenti[0].rata).toBe('[REDACTED]');
    expect(sanitizzato.movimenti[1].liquidita_libera).toBe('[REDACTED]');
    expect(JSON.stringify(sanitizzato)).not.toContain('50000');
    expect(JSON.stringify(sanitizzato)).not.toContain('500');
    expect(JSON.stringify(sanitizzato)).not.toContain('1000');
  });

  it('redige i campi anche con chiavi in maiuscole', () => {
    // normalizeKey converte a minuscolo e rimuove caratteri non alfanumerici/_
    const sensibile = {
      LIQUIDITA_LIBERA: 5000,
      PATRIMONIO_NETTO: 10000,
      PASSIVITA_TOTALE: 2000,
    };
    const sanitizzato = sanitizeMeta(sensibile);
    expect(sanitizzato.LIQUIDITA_LIBERA).toBe('[REDACTED]');
    expect(sanitizzato.PATRIMONIO_NETTO).toBe('[REDACTED]');
    expect(sanitizzato.PASSIVITA_TOTALE).toBe('[REDACTED]');
  });
});
