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

  it('non restituisce 304 alle API quando il client invia validatori di cache', async () => {
    const { createApp } = require('../app');

    await request(createApp({ enableRateLimit: false }))
      .get('/api/health')
      .set('If-None-Match', '"etag-obsoleto"')
      .set('If-Modified-Since', new Date().toUTCString())
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'ok' });
      });
  });
});
