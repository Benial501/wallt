/**
 * I metodi HTTP dichiarati in CORS devono coprire quelli che l'API espone
 * davvero.
 *
 * Nasce da un difetto trovato solo in verifica browser: `PATCH` esisteva nelle
 * rotte di Piano Smart ma non in `Access-Control-Allow-Methods`. Il preflight
 * rispondeva 204 e la richiesta vera veniva bloccata dal browser, quindi il
 * cambio di stato di un piano non funzionava dalla SPA. Nessun test lo vedeva:
 * supertest parla direttamente con l'app e non attraversa CORS.
 */
const { request, createApp } = require('./setup');

const app = createApp({ enableRateLimit: false });
const ORIGIN = 'http://localhost:5173';

const preflight = (metodo, path) => request(app)
  .options(path)
  .set('Origin', ORIGIN)
  .set('Access-Control-Request-Method', metodo);

describe('CORS: metodi consentiti', () => {
  test('il preflight dichiara tutti i metodi usati dall API', async () => {
    const res = await preflight('GET', '/api/piano-smart');
    const consentiti = (res.headers['access-control-allow-methods'] || '')
      .split(',').map((m) => m.trim().toUpperCase());
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].forEach((metodo) => {
      expect(consentiti).toContain(metodo);
    });
  });

  test('PATCH è consentito sulle rotte di Piano Smart', async () => {
    const res = await preflight('PATCH', '/api/piano-smart/1');
    const consentiti = (res.headers['access-control-allow-methods'] || '').toUpperCase();
    expect(consentiti).toContain('PATCH');
  });

  test('ogni metodo registrato nel router è dichiarato in CORS', async () => {
    // Scorre lo stack di Express e raccoglie i metodi realmente montati: se
    // qualcuno aggiunge un verbo nuovo senza toccare la configurazione CORS,
    // questo test lo intercetta.
    const metodiUsati = new Set();
    const raccogli = (stack) => {
      stack.forEach((layer) => {
        if (layer.route) {
          Object.keys(layer.route.methods || {})
            .forEach((m) => metodiUsati.add(m.toUpperCase()));
        } else if (layer.handle?.stack) {
          raccogli(layer.handle.stack);
        }
      });
    };
    raccogli(app.router?.stack || app._router?.stack || []);

    const res = await preflight('GET', '/api/piano-smart');
    const consentiti = (res.headers['access-control-allow-methods'] || '')
      .split(',').map((m) => m.trim().toUpperCase());

    const mancanti = [...metodiUsati].filter((m) => m !== '_ALL' && !consentiti.includes(m));
    expect(mancanti).toEqual([]);
  });
});
