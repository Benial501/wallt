// Il mock deve stare qui: jest lo solleva in cima al modulo, e l'error
// handler va caricato con la versione finta gia' al suo posto.
jest.mock('../services/monitoraggio.service', () => ({
  inizializzaMonitoraggio: jest.fn(() => false),
  segnalaErrore: jest.fn(() => true),
  monitoraggioAttivo: jest.fn(() => true),
}));

const { sanitizeMeta } = require('../utils/logger');

// `tests/setup.js` carica gia' l'app — e con essa l'error handler — prima che
// questo mock esista, quindi l'handler avrebbe in mano la funzione vera.
// Ricaricare la catena qui e' l'unico modo perche' veda quella finta.
jest.resetModules();
const { errorHandler, NotFoundError, BadRequestError } = require('../middleware/errorHandler.middleware');
const { segnalaErrore } = require('../services/monitoraggio.service');

/**
 * Il monitoraggio e' un canale verso l'esterno: quello che ci passa dentro
 * lascia WALLT. Queste prove tengono ferme due promesse — che i dati
 * finanziari non escano, e che a uscire siano i guasti e non le richieste
 * semplicemente sbagliate.
 */
describe('monitoraggio errori server', () => {
  test('senza SENTRY_DSN non si attiva e resta innocuo', () => {
    const vero = jest.requireActual('../services/monitoraggio.service');
    const originale = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    try {
      expect(vero.inizializzaMonitoraggio()).toBe(false);
      expect(vero.monitoraggioAttivo()).toBe(false);
      // E' chiamato dall'error handler: una seconda eccezione li' trasformerebbe
      // un 500 in una risposta mai inviata.
      expect(() => vero.segnalaErrore(new Error('x'), { userId: 1 })).not.toThrow();
      expect(vero.segnalaErrore(new Error('x'))).toBe(false);
    } finally {
      if (originale !== undefined) process.env.SENTRY_DSN = originale;
    }
  });

  test('il filtro applicato ai report e’ lo stesso dei log', () => {
    const ripulito = sanitizeMeta({
      importo: 1250.5,
      saldo: '980.00',
      descrizione: 'Bonifico a Mario',
      email: 'tizio@example.com',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjF9.firma',
      userId: 42,
      path: '/api/movimenti',
    });

    expect(ripulito.importo).toBe('[REDACTED]');
    expect(ripulito.saldo).toBe('[REDACTED]');
    expect(ripulito.descrizione).toBe('[REDACTED]');
    expect(String(ripulito.email)).not.toContain('tizio@example.com');
    expect(String(ripulito.token)).not.toContain('eyJ1c2VySWQiOjF9');
    // Questi due servono a capire cosa si e' rotto e vanno tenuti.
    expect(ripulito.userId).toBe(42);
    expect(ripulito.path).toBe('/api/movimenti');
  });
});

describe('quali errori arrivano al monitoraggio', () => {
  const risposta = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };
  const richiesta = { method: 'POST', originalUrl: '/api/movimenti', userId: 7 };

  beforeEach(() => jest.clearAllMocks());

  test('un errore 500 viene segnalato', () => {
    errorHandler(new Error('colonna inesistente'), richiesta, risposta(), jest.fn());
    expect(segnalaErrore).toHaveBeenCalledTimes(1);
  });

  test('un 404 non viene segnalato: e’ una risposta prevista, non un guasto', () => {
    errorHandler(new NotFoundError('Movimento non trovato'), richiesta, risposta(), jest.fn());
    expect(segnalaErrore).not.toHaveBeenCalled();
  });

  test('nemmeno un 400 di validazione', () => {
    errorHandler(new BadRequestError('Importo non valido'), richiesta, risposta(), jest.fn());
    expect(segnalaErrore).not.toHaveBeenCalled();
  });
});
