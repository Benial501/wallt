const EmailService = require('../services/email/EmailService');
const service = require('../services/email/SupportEmailService');

const originalEnv = { ...process.env };
const data = {
  user: { id: 42, email: 'user@example.com' },
  category: 'Problema tecnico',
  subject: 'Spesa non salvata',
  message: 'Non riesco a salvare.\n<test>',
};
let sendEmail;
beforeEach(() => {
  Object.assign(process.env, { SUPPORT_EMAIL: 'support@example.com' });
  sendEmail = jest.spyOn(EmailService, 'sendEmail').mockResolvedValue({ ok: true, messageId: 'x' });
});
afterEach(() => { jest.restoreAllMocks(); process.env = { ...originalEnv }; });

test('destinatario, Reply-To utente e metadati del server', async () => {
  expect(await service.sendSupportRequest(data)).toEqual({ confirmationSent: true });

  const support = sendEmail.mock.calls[0][0];
  expect(support.to).toBe('support@example.com');
  expect(support.replyTo).toBe('user@example.com');
  expect(support.subject).toBe('[Wallt Support] Problema tecnico - Spesa non salvata');
  expect(support.text).toContain('User ID: 42');
  expect(support.text).toContain('Email utente: user@example.com');
  expect(support.text).toContain('Data e ora (UTC):');
  expect(support.text).toContain('Versione API:');
  expect(support.text).toContain(data.message);
  // Il testo dell'utente non viene mai interpretato come HTML.
  expect(support.html).toBeUndefined();

  const confirmation = sendEmail.mock.calls[1][0];
  expect(confirmation.to).toBe('user@example.com');
  expect(confirmation.replyTo).toBe('support@example.com');
  expect(confirmation.text).toContain(data.subject);
  expect(confirmation.text).toContain('Abbiamo ricevuto la tua richiesta');
  // La conferma e' l'unica delle due email in HTML: ha il marchio.
  expect(confirmation.html).toContain('Richiesta ricevuta');
  expect(confirmation.html).toContain('wallt-logo-horizontal.png');
});

test('la conferma HTML escapa categoria e oggetto scritti dall utente', async () => {
  await service.sendSupportRequest({
    ...data,
    category: 'Altro',
    subject: '<img src=x onerror="alert(1)">',
  });
  const { html } = sendEmail.mock.calls[1][0];
  expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  expect(html).not.toContain('<img src=x onerror');
});

test('attende la prima email prima della conferma', async () => {
  let complete;
  sendEmail.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const pending = service.sendSupportRequest(data);
  expect(sendEmail).toHaveBeenCalledTimes(1);
  complete({ ok: true });
  await pending;
  expect(sendEmail).toHaveBeenCalledTimes(2);
});

test('non invia la conferma se il supporto non ha ricevuto la richiesta', async () => {
  sendEmail.mockResolvedValueOnce({ ok: false, error: 'destinatario rifiutato' });
  await expect(service.sendSupportRequest(data)).rejects.toThrow();
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

test('il fallimento della sola conferma non fa reinviare la richiesta', async () => {
  sendEmail.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'boom' });
  expect(await service.sendSupportRequest(data)).toEqual({ confirmationSent: false });
});

test('non invia senza SUPPORT_EMAIL configurata', async () => {
  delete process.env.SUPPORT_EMAIL;
  await expect(service.sendSupportRequest(data)).rejects.toMatchObject({ reason: 'config:SUPPORT_EMAIL' });
  expect(sendEmail).not.toHaveBeenCalled();
});

test('il motivo riporta lo stato del servizio, mai il messaggio del provider', async () => {
  sendEmail.mockResolvedValueOnce({ ok: false, reason: 'email_service_not_ready' });
  await expect(service.sendSupportRequest(data))
    .rejects.toMatchObject({ reason: 'email:email_service_not_ready' });

  // Un errore del provider non ha `reason`: non deve trascinarsi dietro il testo.
  sendEmail.mockResolvedValueOnce({ ok: false, error: 'API key re_segreta non valida' });
  await expect(service.sendSupportRequest(data)).rejects.toMatchObject({ reason: 'email:send_failed' });
  const thrown = await service.sendSupportRequest({ ...data }).catch(e => e);
  expect(JSON.stringify(thrown.reason || '')).not.toContain('re_segreta');
});

test('rifiuta header injection nell indirizzo utente', async () => {
  await expect(service.sendSupportRequest({
    ...data, user: { id: 42, email: 'user@example.com\r\nBcc: victim@example.com' },
  })).rejects.toMatchObject({ reason: 'invalid_user_data' });
  expect(sendEmail).not.toHaveBeenCalled();
});

test.each(['\r\n', '\n', '\x00'])('rifiuta caratteri di controllo nell oggetto: %j', async bad => {
  await expect(service.sendSupportRequest({ ...data, subject: `x${bad}Bcc: v@e.com` }))
    .rejects.toMatchObject({ reason: 'invalid_user_data' });
  expect(sendEmail).not.toHaveBeenCalled();
});
