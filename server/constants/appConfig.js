/**
 * Configurazione applicativa modificabile a runtime (feature flag e limiti).
 *
 * Perché esiste: il brief vieta — con ragione — di scrivere `if (count < 25)`
 * sparso nel codice, e chiede che Bank Sync possa essere spento in produzione
 * senza un deploy d'emergenza. Entrambe le cose richiedono che il numero e
 * l'interruttore vivano in un posto solo e si possano cambiare da fuori.
 *
 * Il valore di default sta QUI, nel codice. La tabella `app_config` contiene
 * soltanto le righe che qualcuno ha deliberatamente cambiato: un database
 * vuoto si comporta esattamente come questi default, e una riga cancellata
 * torna al default invece di diventare `null`. Nessun `require` in questo
 * file (stessa regola di `constants/entitlements.js`).
 *
 * `bank_sync_enabled` e `bank_sync_beta_enabled` sono deliberatamente DUE
 * interruttori distinti, non uno: spegnere la beta (posti esauriti, o si
 * passa al modello pagante) non deve spegnere la sincronizzazione a chi
 * l'ha già attivata, e spegnere Bank Sync per un problema del provider non
 * deve cancellare il diritto di chi lo possiede.
 */

const BANK_SYNC_ENABLED = 'bank_sync_enabled';
const BANK_SYNC_BETA_ENABLED = 'bank_sync_beta_enabled';
const BANK_SYNC_BETA_LIMIT = 'bank_sync_beta_limit';
const BANK_SYNC_PROVIDER = 'bank_sync_provider';
const BANK_SYNC_COOLDOWN_SECONDI = 'bank_sync_cooldown_secondi';
const BANK_SYNC_CRON_ENABLED = 'bank_sync_cron_enabled';
const BANK_SYNC_CRON_ORE_MINIME = 'bank_sync_cron_ore_minime';
const BANK_SYNC_CRON_MAX_PER_ESECUZIONE = 'bank_sync_cron_max_per_esecuzione';

/**
 * Ogni chiave dichiara tipo e default. Il tipo non è decorativo: è ciò che
 * `appConfig.service.js` usa per rifiutare un valore scritto male nel
 * database invece di propagarlo (un `bank_sync_beta_limit` che arriva come
 * stringa "25" e viene confrontato con `<` sarebbe un difetto silenzioso).
 */
const SCHEMA = Object.freeze({
  [BANK_SYNC_ENABLED]: {
    tipo: 'boolean',
    default: true,
    descrizione: 'Interruttore globale di Bank Sync. A false nessuna connessione e nessuna sincronizzazione è possibile, nemmeno per chi ha l\'entitlement.',
  },
  [BANK_SYNC_BETA_ENABLED]: {
    tipo: 'boolean',
    default: true,
    descrizione: 'Permette di rivendicare uno dei posti della beta gratuita. Indipendente da bank_sync_enabled.',
  },
  [BANK_SYNC_BETA_LIMIT]: {
    tipo: 'intero',
    default: 25,
    min: 0,
    max: 100000,
    descrizione: 'Quanti utenti possono attivare Bank Sync gratuitamente con source beta_25.',
  },
  [BANK_SYNC_PROVIDER]: {
    tipo: 'testo',
    default: 'enablebanking',
    descrizione: 'Adapter Open Banking in uso: "enablebanking" (registrazione self-service) oppure "gocardless" (nuovi account chiusi dal provider). Il valore "sandbox" è rifiutato in produzione.',
  },
  [BANK_SYNC_COOLDOWN_SECONDI]: {
    tipo: 'intero',
    default: 300,
    min: 0,
    max: 86400,
    descrizione: 'Attesa minima fra due sincronizzazioni manuali della stessa connessione. Protegge la quota API del provider.',
  },
  [BANK_SYNC_CRON_ENABLED]: {
    tipo: 'boolean',
    default: false,
    descrizione: 'Sincronizzazione pianificata. Spenta per default: si accende quando la beta è stabile.',
  },
  [BANK_SYNC_CRON_ORE_MINIME]: {
    tipo: 'intero',
    default: 12,
    min: 1,
    max: 168,
    descrizione: 'Ore minime dall\'ultima sincronizzazione riuscita perché il cron ne tenti un\'altra.',
  },
  [BANK_SYNC_CRON_MAX_PER_ESECUZIONE]: {
    tipo: 'intero',
    default: 20,
    min: 1,
    max: 1000,
    descrizione: 'Quante connessioni al massimo il cron processa in un passaggio. Il batch rispetta il rate limit del provider.',
  },
});

const CHIAVI = Object.keys(SCHEMA);

const isChiaveConfig = (chiave) => Object.prototype.hasOwnProperty.call(SCHEMA, chiave);

/**
 * Converte un valore grezzo (letto dal database o arrivato da una rotta
 * admin) nel tipo dichiarato. Restituisce `undefined` se il valore non è
 * utilizzabile: chi chiama ripiega sul default invece di propagare un valore
 * di cui non si fida.
 */
const normalizzaValore = (chiave, valore) => {
  const regola = SCHEMA[chiave];
  if (!regola) return undefined;

  if (regola.tipo === 'boolean') {
    if (valore === true || valore === 'true' || valore === 1 || valore === '1') return true;
    if (valore === false || valore === 'false' || valore === 0 || valore === '0') return false;
    return undefined;
  }

  if (regola.tipo === 'intero') {
    const n = Number(valore);
    if (!Number.isInteger(n)) return undefined;
    if (regola.min !== undefined && n < regola.min) return undefined;
    if (regola.max !== undefined && n > regola.max) return undefined;
    return n;
  }

  // testo
  if (typeof valore !== 'string') return undefined;
  const trimmed = valore.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
};

const valoreDefault = (chiave) => SCHEMA[chiave]?.default;

module.exports = {
  BANK_SYNC_ENABLED,
  BANK_SYNC_BETA_ENABLED,
  BANK_SYNC_BETA_LIMIT,
  BANK_SYNC_PROVIDER,
  BANK_SYNC_COOLDOWN_SECONDI,
  BANK_SYNC_CRON_ENABLED,
  BANK_SYNC_CRON_ORE_MINIME,
  BANK_SYNC_CRON_MAX_PER_ESECUZIONE,
  SCHEMA,
  CHIAVI,
  isChiaveConfig,
  normalizzaValore,
  valoreDefault,
};
