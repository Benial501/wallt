const mockSendMail = jest.fn();
const mockClose = jest.fn();
const nodemailer = require('nodemailer');
const service = require('../services/email/SupportEmailService');

const originalEnv = { ...process.env };
const data = { user: { id: 42, email: 'user@example.com' }, category: 'Problema tecnico', subject: 'Spesa non salvata', message: 'Non riesco a salvare.\n<test>' };
beforeEach(() => {
  jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail: mockSendMail, close: mockClose });
  Object.assign(process.env, { SMTP_HOST: 'smtps.pec.aruba.it', SMTP_PORT: '465', SMTP_USER: 'support@example.com', SMTP_PASSWORD: 'test-only-secret', SUPPORT_EMAIL: 'support@example.com' });
  mockSendMail.mockReset().mockResolvedValue({ accepted: ['support@example.com'] });
  mockClose.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { process.env = originalEnv; });

test('usa TLS e From configurati, Reply-To utente e metadati server', async () => {
  mockSendMail.mockResolvedValueOnce({ accepted: ['support@example.com'] }).mockResolvedValueOnce({ accepted: ['user@example.com'] });
  expect(await service.sendSupportRequest(data)).toEqual({ confirmationSent: true });
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, port: 465, auth: { user: 'support@example.com', pass: 'test-only-secret' } }));
  const support = mockSendMail.mock.calls[0][0];
  expect(support.from).toEqual({ name: 'Wallt Support', address: 'support@example.com' });
  expect(support.to).toEqual({ address: 'support@example.com' });
  expect(support.replyTo).toEqual({ address: 'user@example.com' });
  expect(support.subject).toBe('[Wallt Support] Problema tecnico - Spesa non salvata');
  expect(support.text).toContain('User ID: 42');
  expect(support.text).toContain('Email utente: user@example.com');
  expect(support.text).toContain('Data e ora (UTC):');
  expect(support.text).toContain('Versione API:');
  expect(support.text).toContain(data.message);
  expect(support.html).toBeUndefined();
  const confirmation = mockSendMail.mock.calls[1][0];
  expect(confirmation.to).toEqual({ address: 'user@example.com' });
  expect(confirmation.text).toContain(data.subject);
  expect(confirmation.text).toContain('abbiamo ricevuto la tua richiesta');
  expect(mockClose).toHaveBeenCalledTimes(2);
});

test('attende la prima email prima della conferma', async () => {
  let complete;
  mockSendMail.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const pending = service.sendSupportRequest(data);
  expect(mockSendMail).toHaveBeenCalledTimes(1);
  complete({ accepted: ['support@example.com'] });
  await pending;
  expect(mockSendMail).toHaveBeenCalledTimes(2);
});

test('non invia conferma quando il supporto rifiuta il destinatario', async () => {
  mockSendMail.mockResolvedValueOnce({ accepted: [], rejected: ['support@example.com'] });
  await expect(service.sendSupportRequest(data)).rejects.toThrow();
  expect(mockSendMail).toHaveBeenCalledTimes(1);
});

test('non trasforma il fallimento della conferma in una richiesta da reinviare', async () => {
  mockSendMail.mockResolvedValueOnce({ accepted: ['support@example.com'] }).mockRejectedValueOnce(new Error('SMTP secret'));
  expect(await service.sendSupportRequest(data)).toEqual({ confirmationSent: false });
});

test.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SUPPORT_EMAIL'])('non invia con configurazione incompleta: %s', async key => {
  delete process.env[key];
  await expect(service.sendSupportRequest(data)).rejects.toThrow();
  expect(mockSendMail).not.toHaveBeenCalled();
});

test('rifiuta header injection nell’indirizzo utente', async () => {
  await expect(service.sendSupportRequest({ ...data, user: { id: 42, email: 'user@example.com\r\nBcc: victim@example.com' } })).rejects.toThrow();
  expect(mockSendMail).not.toHaveBeenCalled();
});

test.each([false, true])('interrompe il socket al timeout anche con TLS già connesso: %s', async connected => {
  const tls = require('tls');
  const { EventEmitter } = require('events');
  const socket = new EventEmitter();
  socket.destroy = jest.fn();
  jest.spyOn(tls, 'connect').mockReturnValue(socket);
  jest.useFakeTimers();
  nodemailer.createTransport.mockImplementation(options => ({
    sendMail: () => new Promise((resolve, reject) => {
      if (options.getSocket) options.getSocket({}, error => { if (error) reject(error); });
    }),
    close: mockClose,
  }));
  try {
    const pending = service.sendSupportRequest(data);
    if (connected) socket.emit('secureConnect');
    const rejected = expect(pending).rejects.toThrow('Invio supporto scaduto');
    await jest.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(socket.destroy).toHaveBeenCalled();
    expect(tls.connect).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtps.pec.aruba.it', port: 465, servername: 'smtps.pec.aruba.it', rejectUnauthorized: true,
    }));
  } finally { jest.useRealTimers(); }
});
