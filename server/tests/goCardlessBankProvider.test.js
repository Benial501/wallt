const GoCardlessBankProvider = require('../services/bankSync/providers/GoCardlessBankProvider');

const creaFetch = (risposte) => {
  const chiamate = [];
  const coda = [...risposte];
  const fetchImpl = async (url, opzioni) => {
    chiamate.push({ url, opzioni });
    const prossima = coda.shift();
    if (!prossima) throw new Error(`Nessuna risposta preparata per ${url}`);
    return {
      ok: prossima.status === undefined || (prossima.status >= 200 && prossima.status < 300),
      status: prossima.status ?? 200,
      json: async () => prossima.body,
    };
  };
  fetchImpl.chiamate = chiamate;
  return fetchImpl;
};

describe('saldo GoCardless', () => {
  it('rilegge il saldo disponibile dalla banca', async () => {
    const fetchImpl = creaFetch([
      { body: { access: 'token-test', access_expires: 3600 } },
      {
        body: {
          balances: [
            { balanceType: 'closingBooked', balanceAmount: { amount: '42.00', currency: 'EUR' } },
            { balanceType: 'interimAvailable', balanceAmount: { amount: '37.25', currency: 'EUR' } },
          ],
        },
      },
    ]);
    const provider = new GoCardlessBankProvider({
      secretId: 'id-test', secretKey: 'chiave-test',
      baseUrl: 'https://api.test.invalid', fetchImpl,
    });

    await expect(provider.getBalance({ providerAccountId: 'conto-123' })).resolves.toBe(37.25);
    expect(fetchImpl.chiamate[1].url).toBe('https://api.test.invalid/accounts/conto-123/balances/');
  });

  it('se la banca non comunica il saldo restituisce null senza interrompere la sync', async () => {
    const fetchImpl = creaFetch([
      { body: { access: 'token-test', access_expires: 3600 } },
      { status: 503, body: {} },
    ]);
    const provider = new GoCardlessBankProvider({
      secretId: 'id-test', secretKey: 'chiave-test',
      baseUrl: 'https://api.test.invalid', fetchImpl,
    });

    await expect(provider.getBalance({ providerAccountId: 'conto-123' })).resolves.toBeNull();
  });
});
