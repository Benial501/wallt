const mockSend = jest.fn();
jest.mock('resend', () => ({ Resend: jest.fn(() => ({ emails: { send: mockSend } })) }));
// setup.js carica già l'app nella suite completa: isola questo service per
// usare sempre il trasporto finto, senza fare richieste al provider reale.
let EmailService;
jest.isolateModules(() => { EmailService = require('../services/email/EmailService'); });

describe('Email di benvenuto', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_placeholder';
    process.env.EMAIL_FROM = 'Wallt <noreply@auth.wallt.it>';
    process.env.APP_URL = 'https://wallt.it';
    mockSend.mockReset().mockResolvedValue({ data: { id: 'email-test' }, error: null });
    EmailService.initEmailService();
  });
  afterAll(() => { process.env = originalEnv; });

  it('invia al destinatario salvato con una chiave idempotente e nome HTML escapato', async () => {
    const result = await EmailService.sendWelcomeEmail({ id: 42, email: 'user@example.com', nome: '<img src=x onerror=alert(1)>' });
    expect(result.ok).toBe(true);
    const [payload, options] = mockSend.mock.calls[0];
    expect(payload.to).toEqual(['user@example.com']);
    expect(payload.from).toBe('Wallt <noreply@auth.wallt.it>');
    expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(payload.html).not.toContain('<img src=x');
    expect(payload.html).toContain('href="https://wallt.it/"');
    expect(payload.text).toContain('Il tuo account è pronto.');
    expect(options.idempotencyKey).toBe('welcome-user-42');
  });

  it('usa un saluto generico quando il nome manca', async () => {
    await EmailService.sendWelcomeEmail({ id: 43, email: 'user@example.com', nome: '   ' });
    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain('Ciao,');
    expect(payload.html).not.toMatch(/undefined|null/);
  });

  it('non invia con un URL applicazione non sicuro', async () => {
    process.env.APP_URL = 'javascript:alert(1)';
    expect((await EmailService.sendWelcomeEmail({ id: 42, email: 'user@example.com' })).ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('non propaga un errore Resend alla registrazione', async () => {
    mockSend.mockRejectedValue(new Error('Provider unavailable'));
    await expect(EmailService.sendWelcomeEmail({ id: 42, email: 'user@example.com' })).resolves.toMatchObject({ ok: false });
  });
});
