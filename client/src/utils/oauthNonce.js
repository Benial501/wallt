const OAUTH_NONCE_KEY = 'wallt_oauth_nonce';

export const generaNonce = () => (crypto.randomUUID
  ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''));

export const salvaNonceOAuth = (nonce) => {
  try {
    localStorage.setItem(OAUTH_NONCE_KEY, nonce);
  } catch {
    // ignore
  }
};

/**
 * Un token è accettato solo se porta il nonce che QUESTO browser ha generato
 * all'apertura del popup. Senza il controllo, un link con il token di un
 * altro account farebbe entrare la vittima nell'account dell'attaccante
 * (login CSRF).
 */
export const nonceOAuthValido = (payload) => {
  let atteso = null;
  try {
    atteso = localStorage.getItem(OAUTH_NONCE_KEY);
  } catch {
    // ignore
  }
  return Boolean(atteso) && payload?.nonce === atteso;
};

export const consumaNonceOAuth = () => {
  try {
    localStorage.removeItem(OAUTH_NONCE_KEY);
  } catch {
    // ignore
  }
};
