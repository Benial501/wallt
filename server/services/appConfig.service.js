const { AppConfig } = require('../models');
const logger = require('../utils/logger');
const {
  SCHEMA, CHIAVI, isChiaveConfig, normalizzaValore, valoreDefault,
} = require('../constants/appConfig');

/**
 * Punto sorgente unico della configurazione a runtime (CLAUDE.md Regola 20
 * applicata ai feature flag).
 *
 * Il brief vieta `if (count < 25)` sparso nel codice e chiede che Bank Sync
 * si possa spegnere in produzione senza un deploy d'emergenza: entrambe le
 * cose richiedono che il numero e l'interruttore vivano in un posto solo.
 * Chi deve sapere "la beta è aperta?" o "quanti posti ci sono?" chiama questo
 * file; il valore letterale non compare da nessun'altra parte.
 *
 * ── Il default sta nel codice, non nel database ──────────────────────────
 * `app_config` contiene solo le righe deliberatamente cambiate. Conseguenze
 * volute: un database vuoto si comporta come il codice (nessuna migrazione
 * deve seminare valori), e cancellare una riga ripristina il default invece
 * di produrre un `null` che si propagherebbe come 0 o false.
 *
 * ── Un valore scritto male non viene propagato ───────────────────────────
 * `normalizzaValore` applica il tipo dichiarato nello schema. Se il database
 * contiene qualcosa di inutilizzabile (una stringa dove serve un intero, un
 * limite negativo) si usa il default e si registra un warning: un
 * `bank_sync_beta_limit` che arriva come "25" e viene confrontato con `<`
 * sarebbe un difetto silenzioso sulla quota dei posti.
 *
 * ── Cache ────────────────────────────────────────────────────────────────
 * Breve e per-istanza. Su Vercel ogni istanza ha la propria, quindi un
 * cambio di flag si propaga entro `TTL_MS` invece di istantaneamente. È il
 * compromesso accettato: la configurazione viene letta a ogni chiamata di
 * `canUseFeature`, e una query per richiesta su un dato che cambia una volta
 * al mese non si giustifica. Per un interruttore d'emergenza 15 secondi
 * restano ordini di grandezza meglio di un deploy. Le letture amministrative
 * passano con `{ fresco: true }` e non vedono mai un valore in cache, così
 * chi ha appena cambiato un flag non legge il proprio stato vecchio.
 */

const TTL_MS = 15 * 1000;

/** @type {Map<string, { valore: unknown, scadenza: number }>} */
const cache = new Map();

const invalidaCache = (chiave = null) => {
  if (chiave) cache.delete(chiave);
  else cache.clear();
};

const dallaCache = (chiave) => {
  const voce = cache.get(chiave);
  if (!voce) return undefined;
  if (voce.scadenza < Date.now()) {
    cache.delete(chiave);
    return undefined;
  }
  return voce.valore;
};

const inCache = (chiave, valore) => {
  cache.set(chiave, { valore, scadenza: Date.now() + TTL_MS });
};

/**
 * Il valore di una chiave di configurazione. Non lancia mai: una tabella
 * irraggiungibile non deve spegnere l'applicazione, e il default è sempre una
 * risposta utilizzabile.
 *
 * @param {string} chiave
 * @param {{ fresco?: boolean }} [opzioni]
 */
async function getConfig(chiave, { fresco = false } = {}) {
  if (!isChiaveConfig(chiave)) {
    // Una chiave inventata è un errore di programmazione, non un dato: va
    // vista subito e non confusa con "il default".
    throw Object.assign(new Error(`Chiave di configurazione sconosciuta: ${chiave}`), { statusCode: 500 });
  }

  if (!fresco) {
    const memorizzato = dallaCache(chiave);
    if (memorizzato !== undefined) return memorizzato;
  }

  let valore = valoreDefault(chiave);
  try {
    const riga = await AppConfig.findByPk(chiave);
    if (riga) {
      const normalizzato = normalizzaValore(chiave, riga.valore);
      if (normalizzato === undefined) {
        logger.warn('Valore di configurazione non valido: uso il default', {
          chiave, tipo_atteso: SCHEMA[chiave].tipo,
        });
      } else {
        valore = normalizzato;
      }
    }
  } catch (error) {
    // Nessun fallback silenzioso e pericoloso: i default dello schema sono
    // scelti per essere sicuri anche quando il database non risponde.
    logger.error('Lettura configurazione fallita: uso il default', { chiave, err: error });
  }

  inCache(chiave, valore);
  return valore;
}

/** Più chiavi in una sola query. Usata dai percorsi che ne leggono tre o
 * quattro insieme (claim beta, stato del piano). */
async function getConfigs(chiavi, { fresco = false } = {}) {
  const risultato = {};
  await Promise.all(chiavi.map(async (chiave) => {
    risultato[chiave] = await getConfig(chiave, { fresco });
  }));
  return risultato;
}

/**
 * Scrive una chiave. Solo da una rotta amministrativa: il valore viene
 * normalizzato prima di essere salvato, quindi un valore fuori intervallo
 * viene rifiutato all'ingresso e non finisce nel database.
 */
async function setConfig(chiave, valore, { actorUserId = null } = {}) {
  if (!isChiaveConfig(chiave)) {
    throw Object.assign(new Error('Chiave di configurazione non valida'), { statusCode: 400 });
  }
  const normalizzato = normalizzaValore(chiave, valore);
  if (normalizzato === undefined) {
    const regola = SCHEMA[chiave];
    throw Object.assign(
      new Error(`Valore non valido per ${chiave}: atteso ${regola.tipo}`
        + `${regola.min !== undefined ? ` fra ${regola.min} e ${regola.max}` : ''}`),
      { statusCode: 400 },
    );
  }

  await AppConfig.upsert({ chiave, valore: normalizzato, aggiornato_da: actorUserId });
  invalidaCache(chiave);
  return normalizzato;
}

/** Riporta una chiave al default rimuovendo la personalizzazione. */
async function resetConfig(chiave) {
  if (!isChiaveConfig(chiave)) {
    throw Object.assign(new Error('Chiave di configurazione non valida'), { statusCode: 400 });
  }
  await AppConfig.destroy({ where: { chiave } });
  invalidaCache(chiave);
  return valoreDefault(chiave);
}

/**
 * L'intera configurazione per la pagina di amministrazione: valore effettivo,
 * default e se è stato personalizzato. Sempre fresca, mai dalla cache.
 */
async function descriviConfigurazione() {
  const righe = await AppConfig.findAll();
  const personalizzate = new Map(righe.map((r) => [r.chiave, r.valore]));

  return CHIAVI.map((chiave) => {
    const regola = SCHEMA[chiave];
    const grezzo = personalizzate.get(chiave);
    const normalizzato = grezzo === undefined ? undefined : normalizzaValore(chiave, grezzo);
    return {
      chiave,
      tipo: regola.tipo,
      descrizione: regola.descrizione,
      default: regola.default,
      valore: normalizzato === undefined ? regola.default : normalizzato,
      personalizzato: normalizzato !== undefined,
      // Una riga presente ma non utilizzabile: va mostrata, non nascosta
      // dietro il default come se fosse tutto in ordine.
      valore_non_valido: grezzo !== undefined && normalizzato === undefined,
    };
  });
}

module.exports = {
  getConfig,
  getConfigs,
  setConfig,
  resetConfig,
  descriviConfigurazione,
  invalidaCache,
};
