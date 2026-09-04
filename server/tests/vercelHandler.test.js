const request = require('supertest');

describe('handler Express per Vercel', () => {
  it('esporta l’app senza aprire una porta e risponde alla health route', async () => {
    const listenSpy = jest.spyOn(require('http').Server.prototype, 'listen');

    const handler = require('../api');

    expect(typeof handler).toBe('function');
    expect(listenSpy).not.toHaveBeenCalled();
    listenSpy.mockRestore();

    await request(handler)
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok' });
      });
  });
});
