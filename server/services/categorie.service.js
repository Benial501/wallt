const { CATEGORIE_DEFAULT, isCategoriaSistema, ESSENZIALITA_VALUES } = require('../constants/categorie');
const CategoriaPersonale = require('../models/CategoriaPersonale');
const CategoriaDefaultNascosta = require('../models/CategoriaDefaultNascosta');
const CategoriaDefaultEssenzialita = require('../models/CategoriaDefaultEssenzialita');
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const serialize = c => ({ ...c.toJSON(), userId: c.user_id, isDefault: false, sistema: false, gruppo: 'Personali', emoji: '🏷️' });

// Lo stesso id può esistere su entrambi i versi (`da_verificare`): la chiave è la coppia.
const hiddenKey = (id, tipo) => `${id}:${tipo}`;

/** Insieme delle predefinite che questo utente ha eliminato, come `id:tipo`. */
async function loadHiddenDefaults(userId, { transaction } = {}) {
  const rows = await CategoriaDefaultNascosta.findAll({ where: { user_id: userId }, transaction });
  return new Set(rows.map(r => hiddenKey(r.categoria_id, r.tipo)));
}

/** Mappa `categoria_id -> essenzialita` delle personalizzazioni di questo
 * utente sulle predefinite di uscita (solo tipo 'uscita': vedi migrazione). */
async function loadEssenzialitaOverrides(userId, { transaction } = {}) {
  const rows = await CategoriaDefaultEssenzialita.findAll({ where: { user_id: userId }, transaction });
  return new Map(rows.map(r => [r.categoria_id, r.essenzialita]));
}

/**
 * Unico punto in cui una predefinita eliminata sparisce dalla lista dell'utente.
 * Tutta la cascata di categorizzazione filtra su questo risultato
 * (CategoryMatcherService._finalize), quindi nasconderla qui basta a impedire
 * che venga riassegnata in automatico. Con `includeArchived` resta invece
 * visibile, ed è ciò che permette allo storico di mostrarne ancora nome e icona.
 *
 * Stesso punto unico per l'essenzialità delle predefinite: una personalizzazione
 * in `categorie_default_essenzialita` sovrascrive qui il valore di catalogo,
 * prima che chiunque altro (analisi, fondo sicurezza, cascata di
 * categorizzazione) legga `essenzialita` da una categoria di questo utente.
 */
async function list(userId, { includeArchived = false, transaction } = {}) {
  const [personal, hidden, essenzialitaOverrides] = await Promise.all([
    CategoriaPersonale.findAll({ where: { user_id: userId, ...(includeArchived ? {} : { attiva: true }) }, transaction, order: [['nome', 'ASC']] }),
    loadHiddenDefaults(userId, { transaction }),
    loadEssenzialitaOverrides(userId, { transaction }),
  ]);
  const defaults = CATEGORIE_DEFAULT
    .map(c => (hidden.has(hiddenKey(c.id, c.tipo)) ? { ...c, attiva: false } : c))
    .map(c => (c.tipo === 'uscita' && essenzialitaOverrides.has(c.id)
      ? { ...c, essenzialita: essenzialitaOverrides.get(c.id), essenzialitaPersonalizzata: true }
      : c))
    .filter(c => includeArchived || c.attiva);
  return [...defaults, ...personal.map(serialize)];
}

/**
 * Imposta o rimuove la personalizzazione di essenzialità di questo utente su
 * una categoria predefinita di uscita. `essenzialita: null` rimuove la
 * personalizzazione (si torna al valore di catalogo, mai cancellato).
 */
async function setEssenzialitaDefault(userId, categoriaId, essenzialita) {
  const standard = CATEGORIE_DEFAULT.find(c => c.id === categoriaId && c.tipo === 'uscita');
  if (!standard) throw error('Categoria predefinita di uscita non trovata', 404);

  if (essenzialita === null) {
    await CategoriaDefaultEssenzialita.destroy({ where: { user_id: userId, categoria_id: categoriaId } });
    return { ...standard };
  }
  if (!ESSENZIALITA_VALUES.includes(essenzialita)) throw error('Essenzialità non valida');

  await CategoriaDefaultEssenzialita.upsert({ user_id: userId, categoria_id: categoriaId, essenzialita });
  return { ...standard, essenzialita, essenzialitaPersonalizzata: true };
}

async function assertCategory(userId, id, tipo, { transaction, allowArchived = false, hiddenDefaults } = {}) {
  if (!['entrata', 'uscita'].includes(tipo) || typeof id !== 'string') throw error('Categoria non valida per questo tipo di movimento');
  const standard = CATEGORIE_DEFAULT.find(c => c.id === id && c.tipo === tipo);
  if (standard) {
    // Le categorie di sistema non sono eliminabili: nessuna query da fare.
    if (allowArchived || isCategoriaSistema(id)) return standard;
    const hidden = hiddenDefaults ?? await loadHiddenDefaults(userId, { transaction });
    if (hidden.has(hiddenKey(id, tipo))) throw error('Categoria non disponibile o incompatibile con il movimento');
    return standard;
  }
  const personal = await CategoriaPersonale.findOne({ where: { id, tipo, user_id: userId, ...(allowArchived ? {} : { attiva: true }) }, transaction, ...(transaction ? { lock: transaction.LOCK.SHARE } : {}) });
  if (!personal) throw error('Categoria non disponibile o incompatibile con il movimento');
  return serialize(personal);
}

module.exports = {
  list, assertCategory, serialize, error, loadHiddenDefaults, hiddenKey, setEssenzialitaDefault,
};
