/**
 * Quale database usano i test, e perché non può essere lo stesso per tutti.
 *
 * Un nome fisso (`wallt_test`) rende il database uno stato globale condiviso
 * da OGNI checkout della stessa macchina: worktree diversi, branch diversi,
 * sessioni diverse. Due conseguenze, entrambe osservate:
 *
 *  - `TRUNCATE ... RESTART IDENTITY` del `beforeEach` di un'altra esecuzione
 *    cancella gli utenti di questa a metà test. Una registrazione risponde
 *    500 (`formatUser` rilegge un utente che non esiste più) e una richiesta
 *    autenticata risponde 401: fallimenti che non si riproducono mai in
 *    isolamento, perché la causa non è nel test che li subisce;
 *  - `db:migrate` di un altro branch applica al database migrazioni che
 *    questo checkout non ha. Una di esse aveva rinominato una colonna di
 *    `movimenti`, e 22 test di 8 suite fallivano con 500 su uno schema che
 *    il codice in esecuzione non aveva mai dichiarato.
 *
 * Il nome viene quindi derivato dalla RADICE DEL CHECKOUT: ogni worktree ha
 * il suo database, che `setup.js` crea e migra da sé al primo passaggio.
 *
 * Una variabile passata ESPLICITAMENTE nell'ambiente del processo vince
 * sempre: è così che la CI resta su `wallt_test` e che
 * `DB_NAME_TEST=... npm test` continua a funzionare. Vince solo se arriva
 * dall'ambiente, non da `.env`: un valore nel file di configurazione è
 * identico in tutti i checkout, quindi rimetterebbe tutti sullo stesso
 * database — cioè esattamente il problema che questo modulo risolve. Dal
 * `.env` si prendono host, porta e credenziali, mai il nome.
 */
const crypto = require('crypto');
const path = require('path');

/** Radice del checkout: `server/tests` → due livelli sopra. */
const RADICE_CHECKOUT = path.resolve(__dirname, '..', '..');

const NOME_BASE = 'wallt_test';

const suffissoCheckout = (radice) => crypto
  .createHash('sha1')
  .update(radice)
  .digest('hex')
  .slice(0, 8);

const nomeDallUrl = (url) => decodeURIComponent(new URL(url).pathname.slice(1));

/**
 * @param {object} opzioni
 * @param {object} opzioni.espliciti  `process.env` COME ERA PRIMA di dotenv.
 * @param {object} opzioni.env        `process.env` dopo dotenv (host, credenziali).
 * @param {string} [opzioni.radice]   Radice del checkout (iniettabile nei test).
 * @returns {{ nome: string, url: string }}
 */
const configuraDatabaseDiTest = ({ espliciti, env, radice = RADICE_CHECKOUT }) => {
  if (espliciti.TEST_DATABASE_URL) {
    return {
      nome: espliciti.DB_NAME_TEST || nomeDallUrl(espliciti.TEST_DATABASE_URL),
      url: espliciti.TEST_DATABASE_URL,
    };
  }

  const nome = espliciti.DB_NAME_TEST || `${NOME_BASE}_${suffissoCheckout(radice)}`;

  // Dal `.env` arrivano solo i parametri di connessione: il nome lo decide
  // questa funzione, altrimenti ogni checkout tornerebbe sullo stesso.
  if (env.TEST_DATABASE_URL) {
    const url = new URL(env.TEST_DATABASE_URL);
    url.pathname = `/${nome}`;
    return { nome, url: url.toString() };
  }

  const user = encodeURIComponent(env.DB_USER || 'postgres');
  const password = encodeURIComponent(env.DB_PASSWORD || '');
  const host = env.DB_HOST || '127.0.0.1';
  const port = Number(env.DB_PORT) || 5432;
  return { nome, url: `postgresql://${user}:${password}@${host}:${port}/${nome}` };
};

module.exports = {
  configuraDatabaseDiTest,
  suffissoCheckout,
  nomeDallUrl,
  NOME_BASE,
  RADICE_CHECKOUT,
};
