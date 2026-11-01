const {
  identificaServizio, descriviMovimento, aggiungiMesi, pianifica,
} = require('../services/abbonamentiRilevamento');

const OGGI = '2026-10-31';

const addebito = (data, importo = '13.99', altro = {}) => ({
  data, importo, categoria: 'streaming', descrizione: 'NETFLIX.COM', ...altro,
});

const riga = (altro = {}) => ({
  id: 1,
  chiave: 'netflix',
  ordine: 0,
  costo: '13.99',
  stato: 'attivo',
  origine: 'rilevato',
  periodo_mesi: 1,
  durata_mesi: null,
  data_inizio: null,
  da_verificare: false,
  riattivato_da_addebito: false,
  annullato_il: null,
  ultimo_addebito_data: null,
  ultimo_addebito_importo: null,
  modificato_utente_il: null,
  movimento_ricorrente_id: null,
  ...altro,
});

const regola = (altro = {}) => ({
  id: 50,
  importo: '13.99',
  categoria: 'streaming',
  descrizione: 'Netflix',
  ricorrente_frequenza: 'mensile',
  stato_ricorrenza: 'attiva',
  ricorrente_occorrenze_rimanenti: null,
  updatedAt: '2026-01-01',
  ...altro,
});

describe('identificaServizio', () => {
  it('riconosce il servizio nelle descrizioni bancarie', () => {
    expect(identificaServizio('NETFLIX.COM').id).toBe('netflix');
    expect(identificaServizio('PAG. POS OPENAI *CHATGPT SUBSCR').id).toBe('chatgpt');
  });

  it('preferisce l\'alias più specifico', () => {
    expect(identificaServizio('APPLE MUSIC').id).toBe('apple-music');
    expect(identificaServizio('Amazon Prime Video').id).toBe('prime-video');
  });

  it('non si confonde con parole più lunghe né con il marketplace', () => {
    expect(identificaServizio('SKYSCANNER VOLI')).toBeNull();
    expect(identificaServizio('AMAZON MKTPLACE')).toBeNull();
    expect(identificaServizio('')).toBeNull();
    expect(identificaServizio(null)).toBeNull();
  });

  it('riconosce il nome esatto anche quando è una parola comune', () => {
    expect(identificaServizio('NOW').id).toBe('now');
    expect(identificaServizio('Adesso now disponibile')).toBeNull();
  });
});

describe('descriviMovimento', () => {
  it('nelle categorie degli abbonamenti basta la categoria', () => {
    expect(descriviMovimento({ categoria: 'abbonamenti', descrizione: 'Palestra Bodylab' })).toMatchObject({
      servizio_id: null, nome: 'Palestra Bodylab', chiave: 'palestra bodylab',
    });
  });

  it('senza categoria conta solo un servizio noto', () => {
    expect(descriviMovimento({ categoria: null, descrizione: 'NETFLIX.COM' }).servizio_id).toBe('netflix');
    expect(descriviMovimento({ categoria: 'da_verificare', descrizione: 'Spotify AB' }).servizio_id).toBe('spotify');
    expect(descriviMovimento({ categoria: null, descrizione: 'Pizzeria da Mario' })).toBeNull();
  });

  it('su qualunque altra categoria il nome non basta', () => {
    expect(descriviMovimento({ categoria: 'trasferimento_denaro', descrizione: 'Bonifico a Claude Rossi' })).toBeNull();
  });

  it('accetta le categorie dove la cascata manda i servizi noti', () => {
    expect(descriviMovimento({ categoria: 'videogiochi', descrizione: 'XBOX GAME PASS' }).servizio_id).toBe('xbox-game-pass');
    expect(descriviMovimento({ categoria: 'shopping_online', descrizione: 'AMAZON MUSIC' }).servizio_id).toBe('amazon-music');
    expect(descriviMovimento({ categoria: 'videogiochi', descrizione: 'PLAYSTATION STORE' })).toBeNull();
    expect(descriviMovimento({ categoria: 'videogiochi', descrizione: 'NETFLIX' })).toBeNull();
  });

  it('riconosce telefonia, palestre e consegne nelle loro categorie', () => {
    expect(descriviMovimento({ categoria: 'telefono', descrizione: 'VODAFONE ITALIA SPA' }).servizio_id).toBe('vodafone');
    expect(descriviMovimento({ categoria: 'internet', descrizione: 'FASTWEB SPA' }).servizio_id).toBe('fastweb');
    expect(descriviMovimento({ categoria: 'palestra', descrizione: 'MCFIT MILANO' }).servizio_id).toBe('mcfit');
    expect(descriviMovimento({ categoria: 'delivery', descrizione: 'GLOVO PRIME' }).servizio_id).toBe('glovo-prime');
    expect(descriviMovimento({ categoria: 'videogiochi', descrizione: 'EA PLAY' }).servizio_id).toBe('ea-play');
  });

  it('una consegna o una ricarica qualunque non diventano un abbonamento', () => {
    expect(descriviMovimento({ categoria: 'delivery', descrizione: 'GLOVO ORDINE 123' })).toBeNull();
    expect(descriviMovimento({ categoria: 'telefono', descrizione: 'RICARICA BAR SPORT' })).toBeNull();
    expect(descriviMovimento({ categoria: 'taxi', descrizione: 'UBER TRIP' })).toBeNull();
    // Il casello è un pedaggio, non il canone.
    expect(descriviMovimento({ categoria: 'pedaggi', descrizione: 'TELEPASS' })).toBeNull();
  });

  it('non confonde servizi dal nome simile', () => {
    expect(identificaServizio('TIMVISION').id).toBe('timvision');
    expect(identificaServizio('TIM SPA').id).toBe('tim');
    expect(identificaServizio('GITHUB COPILOT').id).toBe('copilot');
    expect(identificaServizio('GITHUB INC').id).toBe('github');
    expect(identificaServizio('APPLE ONE').id).toBe('apple-one');
  });

  it('ricariche, negozi e rate degli operatori non sono abbonamenti', () => {
    [
      ['telefono', 'RICARICA TIM'],
      ['telefono', 'RICARICA VODAFONE 20 EUR'],
      ['telefono', 'VODAFONE STORE MILANO'],
      ['telefono', 'RICARICA ILIAD'],
      ['telefono', 'TIM STORE ROMA ACQUISTO IPHONE'],
      ['telefono', 'RATA SMARTPHONE WINDTRE'],
      ['telefono', 'HO. MOBILE ATTIVAZIONE SIM'],
      ['internet', 'STARLINK KIT'],
      ['palestra', 'MCFIT ISCRIZIONE ANNUALE'],
      ['commissioni_bancarie', 'REVOLUT METAL CONSEGNA CARTA'],
      [null, 'RICARICA VODAFONE'],
    ].forEach(([categoria, descrizione]) => {
      expect(descriviMovimento({ categoria, descrizione })).toBeNull();
    });
  });

  it('un bonifico a una persona di nome Tim non è l\'abbonamento TIM', () => {
    expect(descriviMovimento({ categoria: 'telefono', descrizione: 'To Tim Rossi' })).toBeNull();
    expect(descriviMovimento({ categoria: 'telefono', descrizione: 'Bonifico a Tim Rossi' })).toBeNull();
    expect(identificaServizio('TIM').id).toBe('tim');
    expect(identificaServizio('TELECOM ITALIA SPA').id).toBe('tim');
  });

  it('gli operatori e le palestre si riconoscono anche dove li manda il dizionario', () => {
    expect(descriviMovimento({ categoria: 'bollette', descrizione: 'VODAFONE ITALIA' }).servizio_id).toBe('vodafone');
    expect(descriviMovimento({ categoria: 'svago', descrizione: 'MCFIT' }).servizio_id).toBe('mcfit');
    expect(descriviMovimento({ categoria: 'bollette', descrizione: 'ENEL ENERGIA' })).toBeNull();
    expect(descriviMovimento({ categoria: 'svago', descrizione: 'NETFLIX' })).toBeNull();
  });

  it('un nome comune non basta a fare un abbonamento', () => {
    ['HOTEL MISTRAL', 'ZOOM TORINO BIOPARCO', 'NORTON MOTO', 'BAR ROMA SUNO', 'SKY BAR ROMA', 'CURSOR MOUSE SHOP', 'GEMINI RISTORANTE'].forEach((descrizione) => {
      expect(descriviMovimento({ categoria: 'altro_uscita', descrizione })).toBeNull();
    });
    expect(identificaServizio('ZOOM.US 888').id).toBe('zoom');
    expect(identificaServizio('MISTRAL AI').id).toBe('mistral');
    expect(identificaServizio('SKY ITALIA').id).toBe('sky');
    expect(identificaServizio('GEMINI').id).toBe('gemini');
  });

  it('Telepass è un abbonamento solo col canone, non al casello', () => {
    expect(descriviMovimento({ categoria: null, descrizione: 'TELEPASS' })).toBeNull();
    expect(descriviMovimento({ categoria: 'pedaggi', descrizione: 'TELEPASS' })).toBeNull();
    expect(descriviMovimento({ categoria: 'pedaggi', descrizione: 'CANONE TELEPASS' }).servizio_id).toBe('telepass');
  });

  it('la scritta del cron non cambia il servizio', () => {
    expect(descriviMovimento({ categoria: 'abbonamenti', descrizione: 'Palestra Fit (automatico)' })).toMatchObject({
      chiave: 'palestra fit', nome: 'Palestra Fit',
    });
    expect(identificaServizio('NOW (automatico)').id).toBe('now');
  });

  it('una scelta esplicita della categoria abbonamenti vince sulle parole escluse', () => {
    expect(descriviMovimento({ categoria: 'abbonamenti', descrizione: 'RICARICA VODAFONE' }).servizio_id).toBe('vodafone');
  });

  it('senza descrizione usa il nome della categoria', () => {
    expect(descriviMovimento({ categoria: 'abbonamenti', descrizione: '' })).toMatchObject({
      nome: 'Abbonamenti', chiave: 'categoria:abbonamenti',
    });
    expect(descriviMovimento({ categoria: 'streaming', descrizione: null }).nome).toBe('Streaming');
  });
});

describe('aggiungiMesi', () => {
  it('resta a fine mese invece di sconfinare in quello dopo', () => {
    expect(aggiungiMesi('2027-01-31', 1)).toBe('2027-02-28');
    expect(aggiungiMesi('2028-01-31', 1)).toBe('2028-02-29');
    expect(aggiungiMesi('2026-11-30', 3)).toBe('2027-02-28');
    expect(aggiungiMesi('2026-10-31', -3)).toBe('2026-07-31');
  });
});

describe('pianifica', () => {
  const piano = (dati) => pianifica({ regole: [], righe: [], oggi: OGGI, ...dati });

  it('senza movimenti non fa nulla', () => {
    expect(piano({ movimenti: [] })).toEqual({ crea: [], aggiorna: [] });
  });

  describe('nuovi abbonamenti', () => {
    it('un solo addebito crea un mensile da controllare', () => {
      const { crea, aggiorna } = piano({ movimenti: [addebito('2026-10-12')] });
      expect(aggiorna).toEqual([]);
      expect(crea).toHaveLength(1);
      expect(crea[0]).toMatchObject({
        chiave: 'netflix',
        servizio_id: 'netflix',
        icona: 'netflix',
        nome: 'Netflix',
        ordine: 0,
        costo: '13.99',
        periodo_mesi: 1,
        origine: 'rilevato',
        stato: 'attivo',
        da_verificare: true,
        ultimo_addebito_data: '2026-10-12',
        ultimo_addebito_importo: '13.99',
      });
    });

    it('due addebiti a un mese di distanza dimostrano il periodo', () => {
      const { crea } = piano({ movimenti: [addebito('2026-09-12'), addebito('2026-10-12')] });
      expect(crea).toHaveLength(1);
      expect(crea[0].da_verificare).toBe(false);
    });

    it('due importi molto diversi a un mese di distanza non dimostrano il periodo', () => {
      const { crea } = piano({ movimenti: [addebito('2026-09-12', '2.99'), addebito('2026-10-12', '59.99')] });
      expect(crea).toHaveLength(1);
      expect(crea[0]).toMatchObject({ costo: '59.99', da_verificare: true });
    });

    it('due addebiti troppo vicini non dimostrano nulla', () => {
      const { crea } = piano({ movimenti: [addebito('2026-10-01'), addebito('2026-10-12')] });
      expect(crea).toHaveLength(1);
      expect(crea[0].da_verificare).toBe(true);
    });

    it('due importi diversi nello stesso mese sono due abbonamenti', () => {
      const apple = (data, importo) => addebito(data, importo, { categoria: 'abbonamenti_digitali', descrizione: 'APPLE.COM/BILL' });
      const { crea } = piano({ movimenti: [apple('2026-10-02', '0.99'), apple('2026-10-05', '10.99')] });
      expect(crea.map((r) => r.costo).sort()).toEqual(['0.99', '10.99']);
      expect(crea.map((r) => r.ordine).sort()).toEqual([0, 1]);
      expect(new Set(crea.map((r) => r.chiave)).size).toBe(1);
    });

    it('un movimento senza descrizione non rompe nulla', () => {
      const { crea } = piano({ movimenti: [addebito('2026-10-12', '5.00', { categoria: 'abbonamenti', descrizione: '' })] });
      expect(crea[0]).toMatchObject({ nome: 'Abbonamenti', chiave: 'categoria:abbonamenti', servizio_id: null });
    });
  });

  describe('righe già presenti', () => {
    it('rileggere gli stessi movimenti non cambia nulla', () => {
      const giaLetta = riga({ ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '13.99' });
      expect(piano({ movimenti: [addebito('2026-10-12')], righe: [giaLetta] })).toEqual({ crea: [], aggiorna: [] });
    });

    it('un prezzo nuovo aggiorna il costo senza creare un doppione', () => {
      const { crea, aggiorna } = piano({
        movimenti: [addebito('2026-09-12'), addebito('2026-10-12', '15.49')],
        righe: [riga({ ultimo_addebito_data: '2026-09-12', ultimo_addebito_importo: '13.99' })],
      });
      expect(crea).toEqual([]);
      expect(aggiorna).toEqual([{
        id: 1,
        campi: { costo: '15.49', ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '15.49' },
      }]);
    });

    it('un importo molto diverso non cambia il costo: chiede di controllare', () => {
      const { crea, aggiorna } = piano({
        movimenti: [addebito('2026-09-12', '14.99'), addebito('2026-10-12', '799.00')],
        righe: [riga({ costo: '14.99', ultimo_addebito_data: '2026-09-12', ultimo_addebito_importo: '14.99' })],
      });
      expect(crea).toEqual([]);
      expect(aggiorna).toEqual([{
        id: 1,
        campi: { da_verificare: true, ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '799.00' },
      }]);
    });

    it('due addebiti uguali confermano un prezzo molto diverso su una riga mai toccata', () => {
      const { aggiorna } = piano({
        movimenti: [addebito('2026-09-12', '17.99'), addebito('2026-10-12', '17.99')],
        righe: [riga({ costo: '7.99', ultimo_addebito_data: '2026-08-12', ultimo_addebito_importo: '7.99' })],
      });
      expect(aggiorna).toEqual([{
        id: 1,
        campi: { costo: '17.99', ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '17.99' },
      }]);
    });

    it('un annuale corretto dall\'utente non crolla per un addebito diverso', () => {
      const corretta = riga({
        costo: '49.90', periodo_mesi: 12, modificato_utente_il: '2026-01-01', ultimo_addebito_data: '2026-08-12', ultimo_addebito_importo: '49.90',
      });
      const { aggiorna } = piano({ movimenti: [addebito('2026-09-12', '4.99'), addebito('2026-10-12', '4.99')], righe: [corretta] });
      expect(aggiorna).toEqual([{
        id: 1,
        campi: { da_verificare: true, ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '4.99' },
      }]);
    });

    it('il secondo addebito non toglie l\'avviso se l\'importo resta lontano dal costo', () => {
      const daControllare = riga({
        costo: '14.99', da_verificare: true, ultimo_addebito_data: '2026-09-12', ultimo_addebito_importo: '799.00',
      });
      const { aggiorna } = piano({
        movimenti: [addebito('2026-09-12', '799.00'), addebito('2026-10-12', '500.00')],
        righe: [daControllare],
      });
      expect(aggiorna[0].campi.da_verificare).toBeUndefined();
      expect(aggiorna[0].campi.costo).toBeUndefined();
    });

    it('un addebito precedente alla modifica dell\'utente non cambia il costo', () => {
      const { aggiorna } = piano({
        movimenti: [addebito('2026-10-12', '15.49')],
        righe: [riga({ costo: '9.99', modificato_utente_il: '2026-10-20' })],
      });
      expect(aggiorna[0].campi).toEqual({ ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '15.49' });
    });

    it('il secondo addebito mensile toglie l\'avviso a una riga mai toccata', () => {
      const { aggiorna } = piano({
        movimenti: [addebito('2026-09-12'), addebito('2026-10-12')],
        righe: [riga({ da_verificare: true, ultimo_addebito_data: '2026-09-12', ultimo_addebito_importo: '13.99' })],
      });
      expect(aggiorna[0].campi.da_verificare).toBe(false);
    });

    it('una scelta dell\'utente sulla durata non viene sovrascritta', () => {
      const { aggiorna } = piano({
        movimenti: [addebito('2026-09-12'), addebito('2026-10-12')],
        righe: [riga({ periodo_mesi: 3, modificato_utente_il: '2026-08-01', ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '13.99' })],
      });
      expect(aggiorna).toEqual([]);
    });
  });

  describe('annullati', () => {
    const annullata = (altro = {}) => riga({ stato: 'annullato', annullato_il: '2026-10-10', ...altro });

    it('un addebito dopo l\'annullamento riporta l\'abbonamento fra gli attivi', () => {
      const { aggiorna } = piano({ movimenti: [addebito('2026-10-12')], righe: [annullata()] });
      expect(aggiorna[0].campi).toMatchObject({ stato: 'attivo', riattivato_da_addebito: true, ultimo_addebito_data: '2026-10-12' });
    });

    it('un addebito con la data dell\'annullamento non lo riattiva', () => {
      expect(piano({ movimenti: [addebito('2026-10-10')], righe: [annullata()] }).aggiorna).toEqual([]);
    });

    it('un addebito precedente non lo riattiva', () => {
      expect(piano({ movimenti: [addebito('2026-09-10')], righe: [annullata()] }).aggiorna).toEqual([]);
    });

    it('un prezzo diverso lo riattiva comunque se è l\'unica riga del servizio', () => {
      const { aggiorna, crea } = piano({ movimenti: [addebito('2026-10-12', '15.49')], righe: [annullata()] });
      expect(crea).toEqual([]);
      expect(aggiorna[0].campi).toMatchObject({ stato: 'attivo', costo: '15.49' });
    });
  });

  describe('a tempo', () => {
    const aTempo = (altro = {}) => riga({ durata_mesi: 3, data_inizio: '2026-05-15', ultimo_addebito_data: '2026-07-15', ultimo_addebito_importo: '13.99', ...altro });

    it('un addebito dopo la fine toglie la scadenza e chiede di controllare', () => {
      const { aggiorna } = piano({ movimenti: [addebito('2026-10-12')], righe: [aTempo()] });
      expect(aggiorna[0].campi).toMatchObject({
        durata_mesi: null, data_inizio: null, da_verificare: true, riattivato_da_addebito: true, annullato_il: '2026-08-15',
      });
    });

    it('resta da controllare anche alla lettura successiva, con addebiti regolari', () => {
      const dopo = aTempo({
        durata_mesi: null, data_inizio: null, da_verificare: true, riattivato_da_addebito: true, annullato_il: '2026-08-15', ultimo_addebito_data: '2026-10-12',
      });
      const movimenti = [addebito('2026-09-12'), addebito('2026-10-12')];
      expect(piano({ movimenti, righe: [dopo] }).aggiorna).toEqual([]);
    });

    it('un addebito durante il periodo non cambia la scadenza', () => {
      const inCorso = aTempo({ data_inizio: '2026-09-15', ultimo_addebito_data: null, ultimo_addebito_importo: null });
      const { aggiorna } = piano({ movimenti: [addebito('2026-10-12')], righe: [inCorso] });
      expect(aggiorna[0].campi).toEqual({ ultimo_addebito_data: '2026-10-12', ultimo_addebito_importo: '13.99' });
    });
  });

  describe('«Non è un abbonamento»', () => {
    const esclusa = (altro = {}) => riga({ stato: 'escluso', ...altro });

    it('la chiave esclusa non crea altre righe, a qualunque importo', () => {
      expect(piano({ movimenti: [addebito('2026-10-12', '99.00')], righe: [esclusa()] })).toEqual({ crea: [], aggiorna: [] });
      expect(piano({ movimenti: [addebito('2026-10-12')], righe: [esclusa()] })).toEqual({ crea: [], aggiorna: [] });
    });

    it('le altre righe della chiave continuano a vivere', () => {
      const apple = (data, importo) => addebito(data, importo, { categoria: 'abbonamenti_digitali', descrizione: 'APPLE.COM/BILL' });
      const chiave = 'apple com bill';
      const { crea, aggiorna } = piano({
        movimenti: [apple('2026-10-02', '1.09'), apple('2026-10-05', '2.99')],
        righe: [
          esclusa({ id: 1, chiave, costo: '1.09', ordine: 0 }),
          riga({ id: 2, chiave, costo: '2.99', ordine: 1 }),
        ],
      });
      expect(crea).toEqual([]);
      expect(aggiorna).toEqual([{ id: 2, campi: { ultimo_addebito_data: '2026-10-05', ultimo_addebito_importo: '2.99' } }]);
    });
  });

  describe('più righe sullo stesso servizio', () => {
    const chiave = 'apple com bill';
    const apple = (data, importo) => addebito(data, importo, { categoria: 'abbonamenti_digitali', descrizione: 'APPLE.COM/BILL' });
    const righe = () => [
      riga({ id: 1, chiave, costo: '0.99', ordine: 0, ultimo_addebito_data: '2026-09-02', ultimo_addebito_importo: '0.99' }),
      riga({ id: 2, chiave, costo: '10.99', ordine: 1, ultimo_addebito_data: '2026-09-05', ultimo_addebito_importo: '10.99' }),
    ];

    it('ogni addebito va alla riga con lo stesso costo', () => {
      const { crea, aggiorna } = piano({ movimenti: [apple('2026-10-02', '0.99'), apple('2026-10-05', '10.99')], righe: righe() });
      expect(crea).toEqual([]);
      expect(aggiorna.map((a) => a.id).sort()).toEqual([1, 2]);
      aggiorna.forEach((a) => expect(a.campi.costo).toBeUndefined());
    });

    it('un rincaro entro il 25% aggiorna la riga più vicina', () => {
      const { crea, aggiorna } = piano({ movimenti: [apple('2026-10-05', '11.99')], righe: righe() });
      expect(crea).toEqual([]);
      expect(aggiorna).toEqual([{ id: 2, campi: { costo: '11.99', ultimo_addebito_data: '2026-10-05', ultimo_addebito_importo: '11.99' } }]);
    });

    it('un acquisto singolo di tutt\'altro importo non cambia nulla', () => {
      expect(piano({ movimenti: [apple('2026-10-05', '4.99')], righe: righe() })).toEqual({ crea: [], aggiorna: [] });
    });
  });

  describe('programmazioni', () => {
    it('una programmazione crea la riga col periodo già noto', () => {
      const { crea } = piano({ movimenti: [], regole: [regola({ ricorrente_frequenza: 'annuale', importo: '49.90' })] });
      expect(crea[0]).toMatchObject({
        chiave: 'netflix', periodo_mesi: 12, costo: '49.90', da_verificare: false, movimento_ricorrente_id: 50,
      });
    });

    it('programmazione e sue occorrenze sono una riga sola, senza avviso', () => {
      const { crea } = piano({ movimenti: [addebito('2026-10-12', '13.99', { ricorrenza_origine_id: 50 })], regole: [regola()] });
      expect(crea).toHaveLength(1);
      expect(crea[0]).toMatchObject({ da_verificare: false, movimento_ricorrente_id: 50, ultimo_addebito_data: '2026-10-12' });
    });

    it('le scadenze rimanenti diventano la durata e si leggono solo alla nascita', () => {
      const { crea } = piano({ movimenti: [], regole: [regola({ ricorrente_occorrenze_rimanenti: 3 })] });
      expect(crea[0]).toMatchObject({ durata_mesi: 3, data_inizio: OGGI });

      const esistente = riga({ durata_mesi: 3, data_inizio: '2026-09-01', movimento_ricorrente_id: 50 });
      expect(piano({ movimenti: [], righe: [esistente], regole: [regola({ ricorrente_occorrenze_rimanenti: 2 })] }).aggiorna).toEqual([]);
    });

    it.each(['settimanale', 'giornaliera', 'una_tantum'])('ignora una programmazione %s senza errori', (ricorrente_frequenza) => {
      expect(piano({ movimenti: [], regole: [regola({ ricorrente_frequenza })] })).toEqual({ crea: [], aggiorna: [] });
    });

    it('le occorrenze di una programmazione una tantum non sono addebiti di un abbonamento', () => {
      const { crea } = piano({
        movimenti: [addebito('2026-10-12', '13.99', { ricorrenza_origine_id: 50 })],
        regole: [regola({ ricorrente_frequenza: 'una_tantum', stato_ricorrenza: 'terminata' })],
      });
      expect(crea).toEqual([]);
    });

    it('le occorrenze del cron non creano una seconda scheda', () => {
      const palestra = regola({ descrizione: 'Palestra Fit', categoria: 'abbonamenti', importo: '20.00' });
      const occorrenza = (data) => addebito(data, '20.00', {
        categoria: 'abbonamenti', descrizione: 'Palestra Fit (automatico)', ricorrenza_origine_id: 50,
      });
      const { crea } = piano({ movimenti: [occorrenza('2026-09-01'), occorrenza('2026-10-01')], regole: [palestra] });
      expect(crea).toHaveLength(1);
      expect(crea[0]).toMatchObject({
        chiave: 'palestra fit', nome: 'Palestra Fit', movimento_ricorrente_id: 50, da_verificare: false, ultimo_addebito_data: '2026-10-01',
      });
    });

    it('le occorrenze di un servizio riconosciuto solo dal nome esatto restano sue', () => {
      const now = regola({ descrizione: 'NOW', categoria: 'streaming', importo: '9.99' });
      const { crea } = piano({
        movimenti: [addebito('2026-10-01', '9.99', { descrizione: 'NOW (automatico)', ricorrenza_origine_id: 50 })],
        regole: [now],
      });
      expect(crea).toHaveLength(1);
      expect(crea[0].servizio_id).toBe('now');
    });

    it.each(['sospesa', 'terminata'])('le occorrenze di una programmazione già %s non creano una riga attiva', (stato_ricorrenza) => {
      const { crea } = piano({
        movimenti: [addebito('2026-09-01', '13.99', { ricorrenza_origine_id: 50 }), addebito('2026-10-01', '13.99', { ricorrenza_origine_id: 50 })],
        regole: [regola({ stato_ricorrenza })],
      });
      expect(crea).toEqual([]);
    });

    it('rinominare una programmazione non duplica l\'abbonamento', () => {
      const legata = riga({
        id: 7, chiave: 'palestra fit', costo: '20.00', movimento_ricorrente_id: 50, ultimo_addebito_data: '2026-09-01', ultimo_addebito_importo: '20.00',
      });
      const rinominata = regola({ descrizione: 'Palestra in centro', categoria: 'abbonamenti', importo: '20.00' });
      expect(piano({ movimenti: [], righe: [legata], regole: [rinominata] })).toEqual({ crea: [], aggiorna: [] });

      const { crea, aggiorna } = piano({
        movimenti: [addebito('2026-10-01', '20.00', { categoria: 'abbonamenti', descrizione: 'Palestra in centro (automatico)', ricorrenza_origine_id: 50 })],
        righe: [legata],
        regole: [rinominata],
      });
      expect(crea).toEqual([]);
      expect(aggiorna).toEqual([{ id: 7, campi: { ultimo_addebito_data: '2026-10-01' } }]);
    });

    it('lega una riga esistente alla programmazione', () => {
      const { aggiorna } = piano({ movimenti: [], righe: [riga({ da_verificare: true })], regole: [regola()] });
      expect(aggiorna).toEqual([{ id: 1, campi: { da_verificare: false, movimento_ricorrente_id: 50 } }]);
    });

    it('un importo cambiato nella programmazione aggiorna il costo se è il dato più recente', () => {
      const riga50 = riga({ movimento_ricorrente_id: 50, ultimo_addebito_data: '2026-10-01', ultimo_addebito_importo: '13.99' });
      const { aggiorna } = piano({ movimenti: [], righe: [riga50], regole: [regola({ importo: '15.49', updatedAt: '2026-10-20' })] });
      expect(aggiorna).toEqual([{ id: 1, campi: { costo: '15.49' } }]);
    });

    it('una programmazione più vecchia dell\'ultimo addebito non cambia il costo', () => {
      const riga50 = riga({ costo: '15.49', movimento_ricorrente_id: 50, ultimo_addebito_data: '2026-10-01', ultimo_addebito_importo: '15.49' });
      expect(piano({ movimenti: [], righe: [riga50], regole: [regola({ importo: '13.99', updatedAt: '2026-09-20' })] }).aggiorna).toEqual([]);
    });

    it.each(['sospesa', 'terminata'])('una programmazione %s annulla l\'abbonamento legato', (stato_ricorrenza) => {
      const { aggiorna } = piano({ movimenti: [], righe: [riga({ movimento_ricorrente_id: 50 })], regole: [regola({ stato_ricorrenza })] });
      expect(aggiorna).toEqual([{ id: 1, campi: { stato: 'annullato', annullato_il: OGGI, movimento_ricorrente_id: null } }]);
    });

    it('una programmazione eliminata annulla l\'abbonamento legato', () => {
      const { aggiorna } = piano({ movimenti: [], righe: [riga({ movimento_ricorrente_id: 50 })], regole: [] });
      expect(aggiorna).toEqual([{ id: 1, campi: { stato: 'annullato', annullato_il: OGGI, movimento_ricorrente_id: null } }]);
    });

    it('un addebito arrivato dopo riattiva e non viene annullato di nuovo', () => {
      const annullata = riga({
        stato: 'annullato', annullato_il: '2026-10-01', movimento_ricorrente_id: 50,
      });
      const { aggiorna } = piano({ movimenti: [addebito('2026-10-12')], righe: [annullata], regole: [] });
      expect(aggiorna[0].campi).toMatchObject({ stato: 'attivo', movimento_ricorrente_id: null, riattivato_da_addebito: true });
    });

    it('una programmazione attiva non riattiva una riga annullata', () => {
      const annullata = riga({ stato: 'annullato', annullato_il: '2026-10-01' });
      expect(piano({ movimenti: [], righe: [annullata], regole: [regola()] }).aggiorna).toEqual([]);
    });

    it('una programmazione non crea righe su una chiave esclusa', () => {
      expect(piano({ movimenti: [], righe: [riga({ stato: 'escluso' })], regole: [regola()] })).toEqual({ crea: [], aggiorna: [] });
    });
  });

  it('applicare il piano e ripeterlo non produce altre modifiche', () => {
    const movimenti = [addebito('2026-09-12'), addebito('2026-10-12', '15.49')];
    const regole = [regola({ descrizione: 'Spotify', categoria: 'musica', id: 51, importo: '10.99' })];
    const primo = piano({ movimenti, regole });
    const righe = primo.crea.map((r, i) => ({ ...riga(), ...r, id: i + 1 }));
    expect(piano({ movimenti, regole, righe })).toEqual({ crea: [], aggiorna: [] });
  });
});
