import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { readHelpPreferences, writeHelpPreferences } from '@/utils/helpPreferences';
import { getHelpTopic } from '@/content/helpTopics';

/**
 * Stato della guida: pannello contestuale aperto e preferenza "Primi passi".
 *
 * La preferenza è salvata in localStorage con chiave versionata per utente
 * (`wallt:help:v1:<id>`): resta su questo browser e non è sincronizzata.
 * Lo stato in memoria va resettato al logout / cambio utente
 * (vedi `resetPiniaStores` in utils/session.js), senza toccare le preferenze
 * salvate degli altri account.
 */
export const useHelpStore = defineStore('help', () => {
  const currentUserId = ref(null);
  const panelOpen = ref(false);
  const activeTopicId = ref(null);
  const gettingStartedHidden = ref(false);
  /** true solo dopo che l'identità è stata risolta e le preferenze lette. */
  const initialized = ref(false);

  const activeTopic = computed(() => getHelpTopic(activeTopicId.value));
  const gettingStartedVisible = computed(() => initialized.value && !gettingStartedHidden.value);

  /** Azzera il solo stato in memoria. Non tocca nulla in localStorage. */
  const resetState = () => {
    currentUserId.value = null;
    panelOpen.value = false;
    activeTopicId.value = null;
    gettingStartedHidden.value = false;
    initialized.value = false;
  };

  /**
   * Inizializza lo stato per un utente. Va chiamata solo quando l'identità
   * è nota; con id assente lo stato torna a "non inizializzato".
   */
  const initForUser = (userId) => {
    const id = userId === null || userId === undefined ? '' : String(userId).trim();
    if (!id) {
      resetState();
      return;
    }
    if (initialized.value && currentUserId.value === id) return;

    resetState();
    currentUserId.value = id;
    gettingStartedHidden.value = readHelpPreferences(id).gettingStartedHidden;
    initialized.value = true;
  };

  const persist = () => {
    if (!currentUserId.value) return;
    // Storage non disponibile o pieno: la preferenza resta valida per la
    // sessione corrente, l'app non deve bloccarsi.
    writeHelpPreferences(currentUserId.value, { gettingStartedHidden: gettingStartedHidden.value });
  };

  const openTopic = (topicId) => {
    if (!getHelpTopic(topicId)) return;
    activeTopicId.value = topicId;
    panelOpen.value = true;
  };

  const closePanel = () => {
    panelOpen.value = false;
    activeTopicId.value = null;
  };

  const hideGettingStarted = () => {
    gettingStartedHidden.value = true;
    persist();
  };

  const showGettingStarted = () => {
    gettingStartedHidden.value = false;
    persist();
  };

  return {
    currentUserId,
    panelOpen,
    activeTopicId,
    gettingStartedHidden,
    initialized,
    activeTopic,
    gettingStartedVisible,
    initForUser,
    resetState,
    openTopic,
    closePanel,
    hideGettingStarted,
    showGettingStarted,
  };
});
