const sinon = require('sinon');
const nodemailer = require('nodemailer');
const { request, createApp, registerUser, authHeader } = require('./setup');
const EmailService = require('../services/email/EmailService');

const payload = { category: 'Problema tecnico', subject: 'Spesa non salvata', message: 'Non riesco a salvare una spesa.' };
const originalEnv = { ...process.env };
let app, token, userEmail, sendMail;
beforeEach(async () => {
  Object.assign(process.env, { SMTP_HOST: 'smtps.pec.aruba.it', SMTP_PORT: '465', SMTP_USER: 'support@example.com', SMTP_PASSWORD: 'private-test-password', SUPPORT_EMAIL: 'support@example.com' });
  sinon.stub(EmailService, 'sendWelcomeEmail').resolves({ ok: true });
  sendMail = sinon.stub().callsFake(async mail => ({ accepted: [mail.to.address] }));
  sinon.stub(nodemailer, 'createTransport').returns({ sendMail, close() {} });
  app = createApp({ enableRateLimit: false });
  const registration = await registerUser(app);
  token = registration.res.body.token;
  userEmail = registration.payload.email;
});
afterEach(() => { sinon.restore(); process.env = { ...originalEnv }; });
const post = data => request(app).post('/api/support').set(authHeader(token)).send(data);

test('richiede autenticazione e accetta soltanto POST', async () => {
  expect((await request(app).post('/api/support').send(payload)).status).toBe(401);
  expect((await request(app).get('/api/support').set(authHeader(token))).status).toBe(405);
  expect(sendMail.called).toBe(false);
});

test('usa l’identità dal database, ignorando destinatari e identità dal body', async () => {
  const response = await post({ ...payload, email: 'attacker@example.com', userId: 999, to: 'victim@example.com', from: 'fake@example.com' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ message: 'Richiesta inviata', confirmationSent: true });
  expect(sendMail.firstCall.args[0].replyTo.address).toBe(userEmail);
  expect(sendMail.firstCall.args[0].to.address).toBe('support@example.com');
  expect(sendMail.secondCall.args[0].to.address).toBe(userEmail);
});

test.each([
  { category: 'non valida' }, { subject: '   ' }, { message: '\n  ' },
  { subject: 'x\r\nBcc: victim@example.com' }, { subject: 'a'.repeat(161) },
  { message: 'a'.repeat(5001) }, { message: { value: 'hello' } }, { category: ['Altro'] },
])('rifiuta input non valido %j', async invalid => {
  expect((await post({ ...payload, ...invalid })).status).toBe(400);
  expect(sendMail.called).toBe(false);
});

test('non espone dettagli SMTP su errore', async () => {
  sendMail.rejects(new Error('SMTP password=private-test-password host=private-host'));
  const response = await post(payload);
  expect(response.status).toBe(502);
  expect(response.body).toEqual({ error: 'Non siamo riusciti a inviare la richiesta. Riprova.' });
  expect(JSON.stringify(response.body)).not.toContain('private');
  expect(sendMail.callCount).toBe(1);
});

test('conferma fallita: conserva il successo della richiesta principale', async () => {
  sendMail.onSecondCall().rejects(new Error('SMTP unavailable'));
  const response = await post(payload);
  expect(response.status).toBe(200);
  expect(response.body.confirmationSent).toBe(false);
});

test('limite persistente per utente anche su istanze app diverse', async () => {
  for (let i = 0; i < 3; i += 1) expect((await post(payload)).status).toBe(200);
  app = createApp({ enableRateLimit: false });
  expect((await post(payload)).status).toBe(429);
  expect(sendMail.callCount).toBe(6);
  const another = await registerUser(app);
  token = another.res.body.token;
  expect((await post(payload)).status).toBe(200);
});
