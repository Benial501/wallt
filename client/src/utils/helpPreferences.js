/**
 * Preferenze locali della guida ("Primi passi").
 *
 * Modulo puro e senza dipendenze da Vue/Pinia: è testabile in isolamento e
 * riutilizzabile dallo store. La persistenza è locale al browser (localStorage)
 * e NON viene sincronizzata tra dispositivi o sessioni diverse.
 *
 * Chiave versionata per utente: `wallt:help:v1:<user id>`.
 */

export const HELP_PREFS_VERSION = 'v1';
export const HELP_PREFS_PREFIX = `wallt:help:${HELP_PREFS_VERSION}:`;

/** Preferenze di default: la card Primi passi è visibile. */
export const defaultHelpPreferences = () => ({ gettingStartedHidden: false });

/** Chiave di storage per un utente, o null se l'identità non è risolta. */
export const helpPreferencesKey = (userId) => {
  if (userId === null || userId === undefined) return null;
  const id = String(userId).trim();
  if (!id) return null;
  return `${HELP_PREFS_PREFIX}${id}`;
};

/**
 * localStorage quando disponibile. L'accesso stesso può lanciare
 * (Safari in navigazione privata, storage bloccato dalle policy del browser).
 */
export const getDefaultStorage = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const normalize = (raw) => ({ gettingStartedHidden: raw?.gettingStartedHidden === true });

/**
 * Legge le preferenze dell'utente. Storage assente, negato o contenuto
 * corrotto non devono mai propagare un errore: si torna ai default.
 */
export const readHelpPreferences = (userId, storage = getDefaultStorage()) => {
  const key = helpPreferencesKey(userId);
  if (!key || !storage) return defaultHelpPreferences();

  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return defaultHelpPreferences();
  }
  if (!raw) return defaultHelpPreferences();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultHelpPreferences();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return defaultHelpPreferences();
  }

  return normalize(parsed);
};

/** Salva le preferenze del solo utente indicato. Ritorna true se il salvataggio è riuscito. */
export const writeHelpPreferences = (userId, prefs, storage = getDefaultStorage()) => {
  const key = helpPreferencesKey(userId);
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(normalize(prefs)));
    return true;
  } catch {
    return false;
  }
};

/** Rimuove le preferenze del solo utente indicato (mai quelle degli altri account). */
export const clearHelpPreferences = (userId, storage = getDefaultStorage()) => {
  const key = helpPreferencesKey(userId);
  if (!key || !storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
