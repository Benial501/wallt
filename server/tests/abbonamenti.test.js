const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { Abbonamento, ScheduledPayment } = require('../models');
const { giornoLocale, FUSO_DEFAULT } = require('../services/notifiche/notificheTime');
const { aggiungiMesi } = require('../services/abbonamentiRilevamento');

const oggi = () => giornoLocale(new Date(), FUSO_DEFAULT);

describe('API abbonamenti', () => {
  let app;
  let token;
  let userId;
  let conto;

  const payload = (altro = {}) => ({
    nome: 'Netflix', servizio_id: 'netflix', icona: 'netflix', costo: '13.99', periodo_mesi: 1, durata_mesi: null, data_inizio: null, ...altro,
  });
  const leggi = (t = token) => request(app).get('/api/abbonamenti').set(authHeader(t));
  const crea = (corpo, t = token) => request(app).post('/api/abbonamenti').set(authHeader(t)).send(corpo);
  const azione = (id, nome, t = token) => request(app).patch(`/api/abbonamenti/${id}/${nome}`).set(authHeader(t));

  const movimento = (altro = {}) => Movimento.create({
    user_id: userId,
    conto_id: conto.id,
    tipo: 'uscita',
    importo: '13.99',
    categoria: 'streaming',
    descrizione: 'NETFLIX.COM',
    data: oggi(),
    ricorrente: false,
    ...altro,
  });

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({
      user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true,
    });
  });

  it('richiede l\'autenticazione', async () => {
    expect((await request(app).get('/api/abbonamenti')).status).toBe(401);
  });

  describe('aggiungere e modificare', () => {
    it('crea un abbonamento e ne restituisce i conti', async () => {
      const creato = await crea(payload());
      expect(creato.status).toBe(201);
      expect(creato.body.abbonamento).toMatchObject({
        nome: 'Netflix',
        servizio_id: 'netflix',
        origine: 'manuale',
        stato_effettivo: 'attivo',
        da_verificare: false,
        costi: { al_mese: 13.99, in_un_anno: 167.88, in_totale: null, peso_annuo: 167.88 },
      });

      const elenco = await leggi();
      expect(elenco.status).toBe(200);
      expect(elenco.body.attivi).toHaveLength(1);
      expect(elenco.body.non_attivi).toEqual([]);
      expect(elenco.body.totali).toEqual({ al_mese: 13.99, all_anno: 167.88, se_tutti_12_mesi: null });
    });

    it('somma i totali come nelle bozze, dal costo annuo più alto', async () => {
      await crea(payload());
      await crea(payload({ nome: 'Prime Video', servizio_id: 'prime-video', icona: 'prime-video', costo: '49.90', periodo_mesi: 12 }));
      await crea(payload({ nome: 'ChatGPT', servizio_id: 'chatgpt', icona: 'chatgpt', costo: '23.00' }));
      await crea(payload({ nome: 'Claude', servizio_id: 'claude', icona: 'claude', costo: '18.00' }));
      await crea(payload({
        nome: 'Spotify', servizio_id: 'spotify', icona: 'spotify', costo: '10.99', durata_mesi: 3, data_inizio: oggi(),
      }));

      const { body } = await leggi();
      expect(body.totali).toEqual({ al_mese: 70.14, all_anno: 742.75, se_tutti_12_mesi: 841.66 });
      expect(body.attivi.map((a) => a.nome)).toEqual(['ChatGPT', 'Claude', 'Netflix', 'Spotify', 'Prime Video']);
      expect(body.attivi[3].costi).toMatchObject({ in_totale: 32.97, in_un_anno: 131.88, peso_annuo: 32.97 });
    });

    it('ammette un abbonamento fuori elenco', async () => {
      const creato = await crea(payload({ nome: 'Palestra FitActive', servizio_id: null, icona: 'palestra' }));
      expect(creato.status).toBe(201);
      expect(creato.body.abbonamento).toMatchObject({ nome: 'Palestra FitActive', servizio_id: null, icona: 'palestra' });
    });

    it.each([
      ['nome vuoto', { nome: '  ' }],
      ['nome troppo lungo', { nome: 'x'.repeat(101) }],
      ['costo zero', { costo: '0' }],
      ['costo negativo', { costo: '-5' }],
      ['costo con tre decimali', { costo: '1.999' }],
      ['periodo non ammesso', { periodo_mesi: 2 }],
      ['durata zero', { durata_mesi: 0, data_inizio: '2026-01-01' }],
      ['durata troppo lunga', { durata_mesi: 121, data_inizio: '2026-01-01' }],
      ['durata senza data di inizio', { durata_mesi: 3, data_inizio: null }],
      ['data non valida', { durata_mesi: 3, data_inizio: 'ieri' }],
      ['servizio sconosciuto', { servizio_id: 'inventato' }],
      ['icona sconosciuta', { icona: 'inventata' }],
    ])('rifiuta %s', async (_, altro) => {
      expect((await crea(payload(altro))).status).toBe(400);
      expect(await Abbonamento.count()).toBe(0);
    });

    it('non lascia scrivere al client i campi decisi dal server', async () => {
      const altro = await registerUser(app);
      const creato = await crea(payload({
        user_id: altro.res.body.user.id,
        origine: 'rilevato',
        stato: 'escluso',
        chiave: 'hackerata',
        ordine: 99,
        ultimo_addebito_data: '2020-01-01',
        movimento_ricorrente_id: 12345,
      }));
      expect(creato.status).toBe(201);
      const riga = await Abbonamento.findByPk(creato.body.abbonamento.id);
      expect(riga).toMatchObject({
        user_id: userId, origine: 'manuale', stato: 'attivo', chiave: 'netflix', ordine: 0, ultimo_addebito_data: null, movimento_ricorrente_id: null,
      });
    });

    it('la modifica aggiorna i dati e toglie gli avvisi', async () => {
      await movimento();
      const { body } = await leggi();
      const { id } = body.attivi[0];
      expect(body.attivi[0].da_verificare).toBe(true);

      const modificato = await request(app).put(`/api/abbonamenti/${id}`).set(authHeader(token)).send(payload({ costo: '49.90', periodo_mesi: 12 }));
      expect(modificato.status).toBe(200);
      expect(modificato.body.abbonamento).toMatchObject({ da_verificare: false, periodo_mesi: 12, costi: { in_un_anno: 49.9 } });

      // Stessa chiave: rileggere non ricrea il servizio.
      const dopo = await leggi();
      expect(dopo.body.attivi).toHaveLength(1);
      expect(dopo.body.attivi[0].periodo_mesi).toBe(12);
      expect(dopo.body.attivi[0].costo).toBe(49.9);
    });

    it('togliere la durata toglie anche la data di inizio', async () => {
      const creato = await crea(payload({ durata_mesi: 3, data_inizio: oggi() }));
      const modificato = await request(app).put(`/api/abbonamenti/${creato.body.abbonamento.id}`).set(authHeader(token)).send(payload({ durata_mesi: null, data_inizio: oggi() }));
      expect(modificato.body.abbonamento).toMatchObject({ durata_mesi: null, data_inizio: null, data_fine: null });
    });
  });

  describe('lettura dalle transazioni', () => {
    it('aggiunge da solo un abbonamento trovato nei movimenti', async () => {
      await movimento();
      const { body } = await leggi();
      expect(body.attivi).toHaveLength(1);
      expect(body.attivi[0]).toMatchObject({
        nome: 'Netflix', origine: 'rilevato', da_verificare: true, costo: 13.99, ultimo_addebito_data: oggi(),
      });
    });

    it('rileggere non crea doppioni, nemmeno con letture simultanee', async () => {
      await movimento();
      const risposte = await Promise.all(Array.from({ length: 5 }, () => leggi()));
      risposte.forEach((r) => expect(r.status).toBe(200));
      expect(await Abbonamento.count({ where: { user_id: userId } })).toBe(1);
      const seconda = await leggi();
      expect(seconda.body.attivi).toHaveLength(1);
    });

    it('un abbonamento scritto a mano si unisce ai suoi addebiti', async () => {
      await crea(payload());
      await movimento();
      const { body } = await leggi();
      expect(body.attivi).toHaveLength(1);
      expect(body.attivi[0]).toMatchObject({ origine: 'manuale', ultimo_addebito_data: oggi() });
    });

    it('non guarda oltre i tre mesi, le entrate, i trasferimenti né il futuro', async () => {
      await movimento({ data: aggiungiMesi(oggi(), -4) });
      await movimento({ tipo: 'entrata' });
      await movimento({ tipo: 'trasferimento', conto_destinazione_id: conto.id });
      await movimento({ data: aggiungiMesi(oggi(), 1) });
      expect((await leggi()).body.attivi).toEqual([]);
    });

    it('non usa i movimenti nati da un pagamento programmato', async () => {
      const m = await movimento();
      await ScheduledPayment.create({
        user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: '13.99', data_scadenza: oggi(), stato: 'pagato', movimento_id: m.id,
      });
      expect((await leggi()).body.attivi).toEqual([]);
    });

    it('legge le programmazioni e riconosce il periodo', async () => {
      await movimento({
        ricorrente: true, ricorrente_frequenza: 'annuale', ricorrente_giorno: 1, ricorrente_mese: 1, importo: '49.90',
      });
      const { body } = await leggi();
      expect(body.attivi[0]).toMatchObject({ periodo_mesi: 12, da_verificare: false, costo: 49.9 });
      expect(body.attivi[0].movimento_ricorrente_id).toBeTruthy();
    });

    it('programmazione e occorrenze del cron contano una volta sola nei totali', async () => {
      const regola = await movimento({
        ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 1, importo: '20.00', categoria: 'abbonamenti', descrizione: 'Palestra Fit',
      });
      await movimento({
        importo: '20.00', categoria: 'abbonamenti', descrizione: 'Palestra Fit (automatico)', ricorrenza_origine_id: regola.id,
      });
      const { body } = await leggi();
      expect(body.attivi.map((a) => a.nome)).toEqual(['Palestra Fit']);
      expect(body.totali).toEqual({ al_mese: 20, all_anno: 240, se_tutti_12_mesi: null });
    });

    it('se la lettura delle transazioni fallisce, l\'elenco risponde con ciò che è salvato', async () => {
      await crea(payload());
      const guasto = jest.spyOn(Movimento, 'findAll').mockRejectedValueOnce(new Error('guasto'));
      const risposta = await leggi();
      guasto.mockRestore();
      expect(risposta.status).toBe(200);
      expect(risposta.body.attivi).toHaveLength(1);
    });
  });

  describe('annullare, escludere, ripristinare', () => {
    it('annullare toglie dall\'elenco e dai totali, ripristinare riporta', async () => {
      const { body: { abbonamento: { id } } } = await crea(payload());

      const annullato = await azione(id, 'annulla');
      expect(annullato.status).toBe(200);
      expect(annullato.body.abbonamento).toMatchObject({ stato_effettivo: 'annullato', annullato_il: oggi() });

      const dopo = await leggi();
      expect(dopo.body.attivi).toEqual([]);
      expect(dopo.body.non_attivi).toHaveLength(1);
      expect(dopo.body.totali).toEqual({ al_mese: 0, all_anno: 0, se_tutti_12_mesi: null });

      const ripristinato = await azione(id, 'ripristina');
      expect(ripristinato.body.abbonamento).toMatchObject({ stato_effettivo: 'attivo', annullato_il: null });
    });

    it('un addebito con la stessa data dell\'annullamento non lo riporta', async () => {
      const { body: { abbonamento: { id } } } = await crea(payload());
      await azione(id, 'annulla');
      await movimento();
      expect((await leggi()).body.attivi).toEqual([]);
    });

    it('«Non è un abbonamento» impedisce che torni', async () => {
      await movimento();
      const { body } = await leggi();
      const escluso = await azione(body.attivi[0].id, 'escludi');
      expect(escluso.body.abbonamento.stato_effettivo).toBe('escluso');

      await movimento({ importo: '99.00' });
      const dopo = await leggi();
      expect(dopo.body.attivi).toEqual([]);
      expect(dopo.body.non_attivi).toHaveLength(1);
    });

    it('un abbonamento scritto a mano non si può escludere', async () => {
      const { body: { abbonamento: { id } } } = await crea(payload());
      expect((await azione(id, 'escludi')).status).toBe(422);
    });

    it('un abbonamento a tempo finisce da solo e si può ripristinare', async () => {
      const inizio = aggiungiMesi(oggi(), -4);
      const creato = await crea(payload({ durata_mesi: 3, data_inizio: inizio }));
      expect(creato.body.abbonamento).toMatchObject({ stato_effettivo: 'finito', data_fine: aggiungiMesi(inizio, 3) });

      const elenco = await leggi();
      expect(elenco.body.attivi).toEqual([]);
      expect(elenco.body.non_attivi[0].stato_effettivo).toBe('finito');
      expect(elenco.body.totali.all_anno).toBe(0);

      const ripristinato = await azione(creato.body.abbonamento.id, 'ripristina');
      expect(ripristinato.body.abbonamento).toMatchObject({
        stato_effettivo: 'attivo', durata_mesi: null, da_verificare: true,
      });
    });

    it('sospendere la programmazione annulla l\'abbonamento legato', async () => {
      const regola = await movimento({ ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 1 });
      expect((await leggi()).body.attivi).toHaveLength(1);
      await regola.update({ stato_ricorrenza: 'sospesa' });
      expect((await leggi()).body.attivi).toEqual([]);
    });
  });

  describe('non tocca il denaro', () => {
    it('saldi, patrimonio e movimenti restano identici', async () => {
      await movimento();
      const fotografia = async () => {
        const patrimonio = await request(app).get('/api/conti/patrimonio').set(authHeader(token));
        const c = await Conto.findByPk(conto.id);
        return {
          saldo: c.saldo,
          patrimonio: patrimonio.body,
          movimenti: await Movimento.count({ where: { user_id: userId } }),
        };
      };
      const prima = await fotografia();

      const { body: { abbonamento: { id } } } = await crea(payload({ nome: 'Spotify', servizio_id: 'spotify', icona: 'spotify', costo: '500.00' }));
      await leggi();
      await request(app).put(`/api/abbonamenti/${id}`).set(authHeader(token)).send(payload({ nome: 'Spotify', servizio_id: 'spotify', icona: 'spotify', costo: '900.00' }));
      await azione(id, 'annulla');
      await azione(id, 'ripristina');

      expect(await fotografia()).toEqual(prima);
    });

    it('annullare non ferma la programmazione che scala il conto', async () => {
      const regola = await movimento({ ricorrente: true, ricorrente_frequenza: 'mensile', ricorrente_giorno: 1 });
      const { body } = await leggi();
      await azione(body.attivi[0].id, 'annulla');
      await regola.reload();
      expect(regola.stato_ricorrenza).toBe('attiva');
      expect(regola.ricorrente).toBe(true);
    });
  });

  describe('isolamento fra utenti', () => {
    let tokenAltro;
    let idMio;

    beforeEach(async () => {
      const altro = await registerUser(app);
      tokenAltro = altro.res.body.token;
      idMio = (await crea(payload())).body.abbonamento.id;
    });

    it('un altro utente non vede le mie righe né i miei movimenti', async () => {
      await movimento({ descrizione: 'SPOTIFY', categoria: 'musica' });
      const { body } = await leggi(tokenAltro);
      expect(body.attivi).toEqual([]);
      expect(body.non_attivi).toEqual([]);
    });

    it.each(['annulla', 'escludi', 'ripristina'])('un altro utente non può usare %s', async (nome) => {
      expect((await azione(idMio, nome, tokenAltro)).status).toBe(404);
      expect((await Abbonamento.findByPk(idMio)).stato).toBe('attivo');
    });

    it('un altro utente non può modificare', async () => {
      const risposta = await request(app).put(`/api/abbonamenti/${idMio}`).set(authHeader(tokenAltro)).send(payload({ costo: '1.00' }));
      expect(risposta.status).toBe(404);
      expect((await Abbonamento.findByPk(idMio)).costo).toBe('13.99');
    });
  });
});
