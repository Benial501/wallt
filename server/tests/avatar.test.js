const {
  request,
  createApp,
  registerUser,
  authHeader,
  User,
} = require('./setup');

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const pngDataUrl = (padding = 64) => {
  const bytes = Buffer.from([...PNG_SIGNATURE, ...new Array(padding).fill(0)]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
};

describe('Avatar API', () => {
  let app;

  beforeEach(() => {
    app = createApp({ enableRateLimit: false });
  });

  it('salva l\'immagine profilo e la restituisce su /auth/me', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;
    const immagine = pngDataUrl();

    const uploadRes = await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(token))
      .send({ immagine });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.user.avatar_immagine).toBe(immagine);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(meRes.body.user.avatar_immagine).toBe(immagine);
  });

  it('non espone mai la password nella risposta', async () => {
    const { res: regRes } = await registerUser(app);

    const uploadRes = await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(regRes.body.token))
      .send({ immagine: pngDataUrl() });

    expect(uploadRes.body.user.password).toBeUndefined();
  });

  it('rifiuta un SVG', async () => {
    const { res: regRes } = await registerUser(app);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>').toString('base64');

    const res = await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(regRes.body.token))
      .send({ immagine: `data:image/svg+xml;base64,${svg}` });

    expect(res.status).toBe(400);
  });

  it('rifiuta un URL remoto al posto di un data URL', async () => {
    const { res: regRes } = await registerUser(app);

    const res = await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(regRes.body.token))
      .send({ immagine: 'https://evil.example.com/foto.png' });

    expect(res.status).toBe(400);
  });

  it('rifiuta un\'immagine oltre il limite di dimensione', async () => {
    const { res: regRes } = await registerUser(app);

    const res = await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(regRes.body.token))
      .send({ immagine: pngDataUrl(300 * 1024) });

    expect(res.status).toBe(400);
  });

  it('richiede autenticazione', async () => {
    const res = await request(app)
      .put('/api/impostazioni/avatar')
      .send({ immagine: pngDataUrl() });

    expect(res.status).toBe(401);
  });

  it('rimuove l\'immagine profilo', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;

    await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(token))
      .send({ immagine: pngDataUrl() });

    const deleteRes = await request(app)
      .delete('/api/impostazioni/avatar')
      .set(authHeader(token));

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.user.avatar_immagine).toBeNull();
  });

  it('non tocca l\'immagine profilo di un altro utente', async () => {
    const { res: resA } = await registerUser(app);
    const { res: resB } = await registerUser(app);

    await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(resA.body.token))
      .send({ immagine: pngDataUrl(64) });

    await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(resB.body.token))
      .send({ immagine: pngDataUrl(128) });

    await request(app)
      .delete('/api/impostazioni/avatar')
      .set(authHeader(resB.body.token));

    const utenteA = await User.findByPk(resA.body.user.id);
    expect(utenteA.avatar_immagine).toBe(pngDataUrl(64));
  });

  it('non sovrascrive l\'avatar Google quando si carica un\'immagine', async () => {
    const { res: regRes } = await registerUser(app);
    const token = regRes.body.token;
    await User.update(
      { avatar: 'https://lh3.googleusercontent.com/foto' },
      { where: { id: regRes.body.user.id } },
    );

    await request(app)
      .put('/api/impostazioni/avatar')
      .set(authHeader(token))
      .send({ immagine: pngDataUrl() });

    const utente = await User.findByPk(regRes.body.user.id);
    expect(utente.avatar).toBe('https://lh3.googleusercontent.com/foto');
  });
});
