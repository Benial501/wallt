<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import DataState from '@/components/common/DataState.vue';
import CategoryIcon from '@/components/common/CategoryIcon.vue';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA, loadCategorie } from '@/utils/categorie';
import { creaRisorsa } from '@/utils/risorsa';

// La rilettura usa lo stesso catalogo della gestione categorie e non mostra
// le predefinite locali come se fossero già le categorie dell'account.
const { stato, lastUpdated, carica, reset } = creaRisorsa(loadCategorie, {
  vuotoSe: () => categorie.value.length === 0,
});
const categorie = computed(() => [...CATEGORIE_USCITA, ...CATEGORIE_ENTRATA]);
const riepilogo = computed(() => `${CATEGORIE_USCITA.length} di uscita · ${CATEGORIE_ENTRATA.length} di entrata`);

onMounted(carica);
onUnmounted(reset);
</script>

<template>
  <section class="categorie-home" aria-label="Le mie categorie">
    <h2 class="categorie-home__title">Le mie categorie</h2>
    <DataState
      :stato="stato"
      :last-updated="lastUpdated"
      messaggio-errore="Non è stato possibile caricare le categorie."
      skeleton-type="text"
      :skeleton-lines="3"
      @riprova="carica()"
    >
      <template #vuoto>
        <p class="categorie-home__empty">Non hai categorie attive. Apri la gestione per aggiungerle o ripristinarle.</p>
      </template>
      <p class="categorie-home__summary">{{ riepilogo }}</p>
      <div class="categorie-home__scroll" tabindex="0" role="region" aria-label="Categorie attive dell’account">
        <ul class="categorie-home__list">
          <li v-for="categoria in categorie" :key="`${categoria.tipo}:${categoria.id}`" class="categorie-home__item">
            <span class="categorie-home__icon" :style="{ color: categoria.colore }" aria-hidden="true">
              <CategoryIcon :categoria="categoria.id" :tipo="categoria.tipo" :size="20" />
            </span>
            <span class="categorie-home__name">{{ categoria.nome }}</span>
            <span class="categorie-home__type">{{ categoria.tipo === 'entrata' ? 'Entrata' : 'Uscita' }}</span>
          </li>
        </ul>
      </div>
    </DataState>
    <RouterLink to="/impostazioni/categorie" class="categorie-home__link">Gestisci categorie →</RouterLink>
  </section>
</template>

<style scoped>
.categorie-home,
.categorie-home > .data-state {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.categorie-home__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.375rem;
}

.categorie-home__summary,
.categorie-home__empty {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.categorie-home__scroll {
  max-height: 12.5rem;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  margin-bottom: 0.75rem;
}

.categorie-home__scroll:focus-visible {
  outline: 2px solid var(--accent-green);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

.categorie-home__list { list-style: none; margin: 0; padding: 0; }

.categorie-home__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem;
  border-bottom: 1px solid var(--border);
}

.categorie-home__item:last-child { border-bottom: none; }
.categorie-home__icon { display: flex; flex-shrink: 0; }
.categorie-home__name { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--text-primary); font-size: var(--text-xs); }
.categorie-home__type { flex-shrink: 0; color: var(--text-secondary); font-size: var(--text-xs); }

.categorie-home__link {
  margin-top: auto;
  align-self: center;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.25rem 0;
  color: var(--accent-text);
  font-size: var(--text-xs);
  font-weight: 600;
}

.categorie-home__link:hover { text-decoration: underline; }
.categorie-home__link:focus-visible { outline: none; box-shadow: var(--focus-ring-tight); }
</style>
