<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import WCard from '@/components/common/WCard.vue';
import SupportContact from '@/components/help/SupportContact.vue';
import WButton from '@/components/common/WButton.vue';
import { useHelpStore } from '@/stores/help.store';
import { HELP_SECTIONS, getHelpTopic } from '@/content/helpTopics';
import { ChevronDown, ChevronRight } from '@/utils/appIcons';

/**
 * Guida completa, organizzata per attività.
 * Contenuti statici: la pagina funziona anche senza alcun dato finanziario.
 */

const router = useRouter();
const helpStore = useHelpStore();
const { gettingStartedHidden, initialized } = storeToRefs(helpStore);

const sezioni = computed(() => HELP_SECTIONS.map((sezione) => ({
  ...sezione,
  argomenti: sezione.topics.map((id) => getHelpTopic(id)).filter(Boolean),
})));

/** Argomenti aperti: il primo di ogni sezione parte chiuso, l'utente decide. */
const aperti = ref(new Set());

const isAperto = (id) => aperti.value.has(id);

const toggle = (id) => {
  const next = new Set(aperti.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  aperti.value = next;
};

const vaiASezione = (sezioneId) => {
  const el = document.getElementById(`sezione-${sezioneId}`);
  if (!el) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
};

const riattivaPrimiPassi = () => {
  helpStore.showGettingStarted();
  router.push('/dashboard');
};
</script>

<template>
  <div class="aiuto-view animate-fade-in">
    <header class="page-header">
      <h1 class="page-title">Aiuto</h1>
      <p class="page-sub">
        Come funziona WALLT, spiegato per attività. I dati li inserisci tu:
        non c'è nessun collegamento automatico con la banca.
      </p>
    </header>

    <SupportContact />

    <WCard class="indice">
      <p class="indice__title">Indice</p>
      <div class="indice__list">
        <button
          v-for="sezione in sezioni"
          :key="sezione.id"
          type="button"
          class="indice__link"
          @click="vaiASezione(sezione.id)"
        >
          {{ sezione.title }}
        </button>
      </div>
    </WCard>

    <section
      v-for="sezione in sezioni"
      :id="`sezione-${sezione.id}`"
      :key="sezione.id"
      class="sezione"
      tabindex="-1"
      :aria-labelledby="`titolo-${sezione.id}`"
    >
      <h2 :id="`titolo-${sezione.id}`" class="sezione__title">{{ sezione.title }}</h2>
      <p v-if="sezione.description" class="sezione__desc">{{ sezione.description }}</p>

      <WCard class="sezione__card" padding="0.5rem">
        <div
          v-for="argomento in sezione.argomenti"
          :key="argomento.id"
          class="argomento"
        >
          <button
            type="button"
            class="argomento__toggle"
            :aria-expanded="isAperto(argomento.id) ? 'true' : 'false'"
            :aria-controls="`pannello-${sezione.id}-${argomento.id}`"
            @click="toggle(argomento.id)"
          >
            <span class="argomento__heading">
              <span class="argomento__title">{{ argomento.title }}</span>
              <span class="argomento__summary">{{ argomento.summary }}</span>
            </span>
            <component
              :is="isAperto(argomento.id) ? ChevronDown : ChevronRight"
              :size="16"
              :stroke-width="1.75"
              aria-hidden="true"
            />
          </button>

          <div
            v-if="isAperto(argomento.id)"
            :id="`pannello-${sezione.id}-${argomento.id}`"
            class="argomento__body"
          >
            <p
              v-for="(paragrafo, i) in argomento.paragraphs || []"
              :key="`p-${i}`"
              class="argomento__text"
            >
              {{ paragrafo }}
            </p>

            <ul v-if="argomento.bullets?.length" class="argomento__list">
              <li v-for="(bullet, i) in argomento.bullets" :key="`b-${i}`">{{ bullet }}</li>
            </ul>

            <button
              v-if="argomento.link"
              type="button"
              class="argomento__link"
              @click="router.push(argomento.link.to)"
            >
              {{ argomento.link.label }} →
            </button>
          </div>
        </div>
      </WCard>
    </section>

    <WCard class="riquadro-primi-passi">
      <p class="riquadro-primi-passi__title">Riquadro "Primi passi"</p>
      <p class="riquadro-primi-passi__text">
        <template v-if="initialized && gettingStartedHidden">
          Al momento è nascosto in Home. Puoi rimetterlo quando vuoi.
        </template>
        <template v-else>
          È mostrato in Home, sopra il riepilogo. Puoi nasconderlo dal riquadro stesso.
        </template>
        La preferenza vale solo per questo browser.
      </p>
      <WButton
        v-if="initialized && gettingStartedHidden"
        variant="primary"
        size="md"
        @click="riattivaPrimiPassi"
      >
        Mostra di nuovo Primi passi
      </WButton>
    </WCard>
  </div>
</template>

<style scoped>
.aiuto-view { max-width: 760px; margin: 0 auto; }

.page-header { margin-bottom: 1.25rem; }
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
.page-sub {
  margin-top: 0.375rem;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.indice { margin-bottom: 1.5rem; }
.indice__title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.625rem;
}
.indice__list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.indice__link {
  min-height: 36px;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}
.indice__link:hover { color: var(--accent-green); border-color: rgba(0, 168, 132, 0.35); }
.indice__link:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.sezione { margin-bottom: 1.75rem; scroll-margin-top: 80px; }
.sezione:focus { outline: none; }
.sezione:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 4px; border-radius: var(--radius-md); }
.sezione__title { font-size: 1.0625rem; font-weight: 700; color: var(--text-primary); }
.sezione__desc {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.argomento + .argomento { border-top: 1px solid var(--divider); }

.argomento__toggle {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.875rem 0.75rem;
  background: none;
  border: none;
  text-align: left;
  color: var(--text-primary);
  font-family: inherit;
  cursor: pointer;
  min-height: 44px;
}
.argomento__toggle svg { flex-shrink: 0; margin-top: 0.1875rem; stroke: currentColor; color: var(--text-muted); }
.argomento__toggle:hover .argomento__title { color: var(--accent-green); }
.argomento__toggle:focus-visible { outline: 2px solid var(--border-focus); outline-offset: -2px; border-radius: var(--radius-sm); }

.argomento__heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1875rem; }
.argomento__title { font-size: 0.875rem; font-weight: 600; line-height: 1.35; }
.argomento__summary { font-size: 0.75rem; line-height: 1.45; color: var(--text-muted); }

.argomento__body { padding: 0 0.75rem 1rem; }
.argomento__text {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
}
.argomento__text + .argomento__text { margin-top: 0.5rem; }

.argomento__list {
  margin: 0.625rem 0 0;
  padding-left: 1.125rem;
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
}
.argomento__list li { list-style: disc; font-size: 0.8125rem; line-height: 1.5; color: var(--text-secondary); }

.argomento__link {
  margin-top: 0.75rem;
  padding: 0.375rem 0;
  background: none;
  border: none;
  color: var(--accent-green);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 32px;
}
.argomento__link:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: 4px; }

.riquadro-primi-passi { display: flex; flex-direction: column; gap: 0.625rem; align-items: flex-start; }
.riquadro-primi-passi__title { font-size: 0.9375rem; font-weight: 700; color: var(--text-primary); }
.riquadro-primi-passi__text { font-size: 0.8125rem; line-height: 1.55; color: var(--text-secondary); }
</style>
