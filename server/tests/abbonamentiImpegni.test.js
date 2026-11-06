const {
  request, createApp, registerUser, authHeader, Conto, Movimento,
} = require('./setup');
const { rinnoviDaCoprire } = require('../services/abbonamentiImpegni');
const { giornoLocale, FUSO_DEFAULT } = require('../services/notifiche/notificheTime');

const sommaGiorni = (iso, giorni) => {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + giorni);
  return data.toISOString().slice(0, 10);
};

describe('rinnoviDaCoprire (puro)', () => {
  const oggi = '2026-11-06';
  const limite = '2026-12-06';
  const riga = (altro = {}) => ({
    id: 1, stato: 'attivo', nome: 'Netflix', chiave: 'netflix', servizio_id: 'netflix', costo: '13.99',
    periodo_mesi: 1, giorno_rinnovo: 20, data_inizio: null, ultimo_addebito_data: null,
    movimento_ricorrente_id: null, rinnovo_saltato: null, createdAt: '2026-10-01', ...altro,
  });

  it('conta il prossimo rinnovo entro 30 giorni', () => {
    expect(rinnoviDaCoprire([riga()], [], oggi, limite)).toEqual([
      expect.objectContaining({ abbonamento_id: 1, importo: 13.99, data: '2026-11-20', tipo: 'abbonamento' }),
    ]);
  });

  it('non conta ciò che un\'altra strada conta già o che non si può datare', () => {
    expect(rinnoviDaCoprire([
      riga({ movimento_ricorrente_id: 9 }),
      riga({ giorno_rinnovo: null }),
      riga({ stato: 'annullato' }),
      riga({ periodo_mesi: 12, data_inizio: '2026-03-20' }),
    ], [], oggi, limite)).toEqual([]);
  });

  it('un addebito già arrivato toglie il rinnovo, anche prima che Abbonamenti lo legga', () => {
    const vicino = riga({ giorno_rinnovo: 8 });
    expect(rinnoviDaCoprire([vicino], [{ data: '2026-11-05', categoria: 'streaming', descrizione: 'NETFLIX.COM' }], oggi, limite)).toEqual([]);
    expect(rinnoviDaCoprire([riga({ giorno_rinnovo: 8, ultimo_addebito_data: '2026-11-04' })], [], oggi, limite)).toEqual([]);
    // Un altro servizio non conta come pagamento di questo.
    expect(rinnoviDaCoprire([vicino], [{ data: '2026-11-05', categoria: 'musica', descrizione: 'SPOTIFY' }], oggi, limite)).toHaveLength(1);
  });

  it('saltare vale solo per quel rinnovo', () => {
    expect(rinnoviDaCoprire([riga({ rinnovo_saltato: '2026-11-20' })], [], oggi, limite)).toEqual([]);
    expect(rinnoviDaCoprire([riga({ rinnovo_saltato: '2026-10-20' })], [], oggi, limite)).toHaveLength(1);
  });
});

describe('rinnovi degli abbonamenti nel saldo effettivo', () => {
  let app;
  let token;
  let userId;
  let conto;
  const oggi = () => giornoLocale(new Date(), FUSO_DEFAULT);
  const saldoEffettivo = async (t = token) => (await request(app).get('/api/conti/patrimonio').set(authHeader(t))).body.saldo_effettivo;
  const crea = (altro = {}) => request(app).post('/api/abbonamenti').set(authHeader(token)).send({
    nome: 'Netflix', servizio_id: 'netflix', icona: 'netflix', costo: '13.99', periodo_mesi: 1, durata_mesi: null, data_inizio: null, ...altro,
  });
  const azione = (id, nome, t = token) => request(app).patch(`/api/abbonamenti/${id}/${nome}`).set(authHeader(t));

  beforeEach(async () => {
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    token = res.body.token;
    userId = res.body.user.id;
    conto = await Conto.create({ user_id: userId, nome: 'Conto', tipo: 'banca', saldo: 1000, attivo: true });
  });

  it('un rinnovo in arrivo abbassa il saldo effettivo, saltarlo lo restituisce, senza toccare il conto', async () => {
    const prima = Number(await saldoEffettivo());
    const giorno = Number(sommaGiorni(oggi(), 3).slice(8, 10));
    const { body: { abbonamento } } = await crea({ giorno_rinnovo: giorno });

    expect(Number(await saldoEffettivo())).toBeCloseTo(prima - 13.99, 2);

    const saltato = await azione(abbonamento.id, 'salta-rinnovo');
    expect(saltato.status).toBe(200);
    expect(saltato.body.abbonamento.rinnovo_saltato).toBe(true);
    expect(Number(await saldoEffettivo())).toBeCloseTo(prima, 2);

    await azione(abbonamento.id, 'riprendi-rinnovo');
    expect(Number(await saldoEffettivo())).toBeCloseTo(prima - 13.99, 2);
    expect(Number((await Conto.findByPk(conto.id)).saldo)).toBe(1000);
  });

  it('quando l\'addebito arriva il rinnovo non viene sottratto una seconda volta', async () => {
    const giorno = Number(oggi().slice(8, 10));
    await crea({ giorno_rinnovo: giorno });
    await Movimento.create({
      user_id: userId, conto_id: conto.id, tipo: 'uscita', importo: '13.99', categoria: 'streaming',
      descrizione: 'NETFLIX.COM', data: oggi(), ricorrente: false,
    });
    await conto.update({ saldo: 986.01 });
    expect(Number(await saldoEffettivo())).toBeCloseTo(986.01, 2);
  });

  it('non si salta il rinnovo di un altro utente', async () => {
    const { body: { abbonamento } } = await crea({ giorno_rinnovo: 1 });
    const { res } = await registerUser(app, { email: `altro-${Date.now()}@wallt.test` });
    expect((await azione(abbonamento.id, 'salta-rinnovo', res.body.token)).status).toBe(404);
  });
});
