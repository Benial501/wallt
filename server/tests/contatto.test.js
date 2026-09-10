const sinon = require('sinon');
const { request, createApp, sequelize } = require('./setup');
const EmailService = require('../services/email/EmailService');
const { SUPPORT_CATEGORIES } = require('../constants/supportCategories');

const payload = {
  email: 'visitatore@example.com',
  category: 'Problema con l\'account',
  subject: 'Non riesco ad accedere',
  message: 'Ho dimenticato la password e il reset non arriva.',
};
const originalEnv = { ...process.env };
let app, sendEmail;
beforeEach(() => {
  Object.assign(process.env, { SUPPORT_EMAIL: 'support@example.com' });
  sendEmail = sinon.stub(EmailService, 'sendEmail').resolves({ ok: true, messageId: 'x' });
  app = createApp({ enableRateLimit: false });
});
afterEach(() => { sinon.restore(); process.env = { ...originalEnv }; });
const post = data => request(app).post('/api/contatto').send(data);

test('funziona senza login e accetta soltanto POST', async () => {
  expect((await post(payload)).status).toBe(200);
  expect((await request(app).get('/api/contatto')).status).toBe(405);
  expect(sendEmail.callCount).toBe(1);
});

test('inoltra al supporto con Reply-To del mittente dichiarato', async () => {
  expect((await post(payload)).status).toBe(200);
  const mail = sendEmail.firstCall.args[0];
  expect(mail.to).toBe('support@example.com');
  expect(mail.replyTo).toBe('visitatore@example.com');
  expect(mail.subject).toBe("[Wallt Contatto] Problema con l'account - Non riesco ad accedere");
  expect(mail.text).toContain(payload.message);
  expect(mail.html).toBeUndefined();
});

test('avverte il supporto che il mittente non e autenticato', async () => {
  await post(payload);
  const testo = sendEmail.firstCall.args[0].text;
  expect(testo).toContain('NON autenticato');
  expect(testo).toContain('Email dichiarata: visitatore@example.com');
});

test('non manda nessuna conferma al mittente dichiarato', async () => {
  // Sarebbe un amplificatore di spam: chiunque potrebbe far recapitare
  // posta di Wallt a un indirizzo altrui.
  const response = await post({ ...payload, email: 'vittima@example.com' });
  expect(response.status).toBe(200);
  expect(sendEmail.callCount).toBe(1);
  expect(sendEmail.getCalls().map(c => c.args[0].to)).toEqual(['support@example.com']);
});

test('accetta tutte e sei le categorie della UI', async () => {
  for (const category of SUPPORT_CATEGORIES) {
    // Sei invii dallo stesso IP supererebbero il limite: qui si verifica la
    // validazione delle categorie, non l'anti-spam, che ha un test dedicato.
    await sequelize.query('TRUNCATE TABLE "auth_rate_limits" RESTART IDENTITY CASCADE');
    sendEmail.resetHistory();
    expect((await post({ ...payload, category })).status).toBe(200);
    expect(sendEmail.firstCall.args[0].subject).toBe(`[Wallt Contatto] ${category} - ${payload.subject}`);
  }
});

test.each([
  { email: 'non-una-email' }, { email: '' }, { email: 'a@b.com\r\nBcc: v@e.com' },
  { category: 'non valida' }, { subject: '   ' }, { message: '\n ' },
  { subject: 'x\r\nBcc: victim@example.com' }, { subject: 'a'.repeat(161) },
  { message: 'a'.repeat(5001) }, { message: { value: 'x' } }, { category: ['Altro'] },
])('rifiuta input non valido %j', async invalid => {
  expect((await post({ ...payload, ...invalid })).status).toBe(400);
  expect(sendEmail.called).toBe(false);
});

test('non espone dettagli del provider su errore', async () => {
  sendEmail.rejects(new Error('Resend API key re_private_secret rifiutata'));
  const response = await post(payload);
  expect(response.status).toBe(502);
  expect(response.body).toEqual({ error: 'Non siamo riusciti a inviare la richiesta. Riprova.' });
  expect(JSON.stringify(response.body)).not.toContain('re_private');
});

test('un rifiuto del provider non diventa un falso successo', async () => {
  sendEmail.resolves({ ok: false, error: 'destinatario non valido' });
  expect((await post(payload)).status).toBe(502);
});

test('limite anti-spam per indirizzo IP, persistente fra istanze', async () => {
  for (let i = 0; i < 3; i += 1) expect((await post(payload)).status).toBe(200);
  app = createApp({ enableRateLimit: false });
  // Stesso IP anche cambiando istanza e indirizzo dichiarato: senza login
  // la chiave e' l'IP, non il mittente.
  expect((await post({ ...payload, email: 'altro@example.com' })).status).toBe(429);
  expect(sendEmail.callCount).toBe(3);
});
