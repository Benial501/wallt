const express = require('express');
const request = require('supertest');
const rateLimitMiddleware = require('../middleware/rateLimit.middleware');
const { hashKey, getWindow } = require('../services/authRateLimit.service');

describe('rate limit persistente autenticazione', () => {
  it('espone una factory che crea contatori PostgreSQL indipendenti dalla memoria locale', () => {
    expect(typeof rateLimitMiddleware.createPersistentAuthLimiter).toBe('function');
  });

  it('non memorizza l’indirizzo IP in chiaro e calcola finestre deterministiche', () => {
    const hash = hashKey('203.0.113.42', 'public-auth');
    const otherRouteHash = hashKey('203.0.113.42', 'another-route');
    const window = getWindow(900000, Date.parse('2026-08-30T12:07:00.000Z'));

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('203.0.113.42');
    expect(otherRouteHash).not.toBe(hash);
    expect(window.windowStart.toISOString()).toBe('2026-08-30T12:00:00.000Z');
    expect(window.resetTime.toISOString()).toBe('2026-08-30T12:15:00.000Z');
  });

  const integrationDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
  integrationDescribe('con due istanze dell’app', () => {
    const createLimitedApp = () => {
      const app = express();
      app.post('/login', rateLimitMiddleware.createPersistentAuthLimiter({
        route: 'test-login',
        windowMs: 15 * 60 * 1000,
        max: 10,
      }), (_req, res) => res.status(204).end());
      return app;
    };

    it('somma i tentativi delle due istanze nello stesso database', async () => {
      const appA = createLimitedApp();
      const appB = createLimitedApp();

      for (let index = 0; index < 5; index += 1) {
        await request(appA).post('/login').expect(204);
        await request(appB).post('/login').expect(204);
      }

      await request(appA).post('/login').expect(429);
    });
  });
});
