<script setup>
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import BottomSheet from '@/components/layout/BottomSheet.vue';
import { SlidersHorizontal, Search, X } from '@/utils/appIcons';
import { CATEGORIE_ENTRATA, CATEGORIE_USCITA } from '@/utils/categorie';
import {
  FILTRI_INIZIALI, PERIODI_MOVIMENTI, ORDINI_MOVIMENTI, filtriAttivi,
} from '@/utils/filtriMovimenti';

/**
 * Filtri dei movimenti, separati dalla lista.
 *
 * Tre livelli: i filtri rapidi restano sempre a schermo, le categorie recenti
 * sono la scorciatoia che copre quasi tutti i casi, e il pannello completo
 * esiste per il resto. Su mobile il pannello è un foglio dal basso, su desktop
 * un pannello laterale: stesso contenuto, stesso stato.
 */
const props = defineProps({
  modelValue: { type: Object, required: true },
  conti: { type: Array, default: () => [] },
  /** Id di categoria visti nei movimenti recenti, in ordine di frequenza. */
  categorieRecenti: { type: Array, default: () => [] },
  risultati: { type: Number, default: 0 },
});

const emit = defineEmits(['update:modelValue', 'azzera']);

const pannelloAperto = ref(false);

const aggiorna = (campo, valore) => {
  emit('update:modelValue', { ...props.modelValue, [campo]: valore });
};

const TIPI = [
  { id: '', label: 'Tutti' },
  { id: 'entrata', label: 'Entrate' },
  { id: 'uscita', label: 'Uscite' },
  { id: 'trasferimento', label: 'Trasferimenti' },
];

const tutteCategorie = computed(() => {
  const uniche = new Map();
  [...CATEGORIE_ENTRATA, ...CATEGORIE_USCITA].forEach((categoria) => {
    if (!uniche.has(categoria.id)) uniche.set(categoria.id, categoria);
  });
  return [...uniche.values()];
});

/** Le categorie del tipo scelto; tutte, senza duplicati, quando non è filtrato. */
const categorieDisponibili = computed(() => {
  if (props.modelValue.tipo === 'entrata') return [...CATEGORIE_ENTRATA];
  if (props.modelValue.tipo === 'uscita') return [...CATEGORIE_USCITA];
  if (props.modelValue.tipo === 'trasferimento') return [];
  return tutteCategorie.value;
});

/**
 * Il campo `gruppo` arriva già dal catalogo, e le categorie create
 * dall'utente ricevono 'Personali' dall'API: nessuna resta senza sezione.
 */
const categoriePerGruppo = computed(() => {
  const gruppi = new Map();
  categorieDisponibili.value.forEach((categoria) => {
    const nome = categoria.gruppo || 'Altre';
    if (!gruppi.has(nome)) gruppi.set(nome, []);
    gruppi.get(nome).push(categoria);
  });
  return [...gruppi.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([nome, categorie]) => ({ nome, categorie }));
});

const perId = computed(() => new Map(tutteCategorie.value.map((c) => [c.id, c])));

const recenti = computed(() => props.categorieRecenti
  .map((id) => perId.value.get(id))
  .filter((categoria) => categoria && categorieDisponibili.value.some((c) => c.id === categoria.id))
  .slice(0, 6));

const anniDisponibili = computed(() => {
  const corrente = dayjs().year();
  return Array.from({ length: 8 }, (_, indice) => corrente - indice);
});

const aggiornaTipo = (tipo) => {
  const categoriaCompatibile = !props.modelValue.categoria
    || (tipo !== 'trasferimento' && (
      !tipo
      || [...CATEGORIE_ENTRATA, ...CATEGORIE_USCITA]
        .some((c) => c.id === props.modelValue.categoria && c.tipo === tipo)
    ));
  emit('update:modelValue', {
    ...props.modelValue,
    tipo,
    categoria: categoriaCompatibile ? props.modelValue.categoria : '',
  });
};

const aggiornaPeriodo = (periodo) => {
  const nuovi = { ...props.modelValue, periodo };
  if (periodo === 'personalizzato' && (!nuovi.da || !nuovi.a)) {
    nuovi.da = dayjs().startOf('month').format('YYYY-MM-DD');
    nuovi.a = dayjs().format('YYYY-MM-DD');
  }
  emit('update:modelValue', nuovi);
  if (periodo === 'anno' || periodo === 'personalizzato') pannelloAperto.value = true;
};

const nomeCategoria = (id) => perId.value.get(id)?.nome || id;
const nomeConto = (id) => props.conti.find((c) => String(c.id) === String(id))?.nome || 'Conto';

const attivi = computed(() => filtriAttivi(props.modelValue, { nomeCategoria, nomeConto }));

const rimuovi = (chiave) => {
  emit('update:modelValue', { ...props.modelValue, [chiave]: FILTRI_INIZIALI[chiave] });
};
</script>

<template>
  <section class="filtri" aria-label="Filtri dei movimenti">
    <div class="filtri__rapidi">
      <div class="filtri__tipi" role="group" aria-label="Tipo di movimento">
        <button
          v-for="tipo in TIPI"
          :key="tipo.id || 'tutti'"
          type="button"
          class="filtri__chip"
          :class="{ 'filtri__chip--attivo': modelValue.tipo === tipo.id }"
          :aria-pressed="modelValue.tipo === tipo.id"
          @click="aggiornaTipo(tipo.id)"
        >
          {{ tipo.label }}
        </button>
      </div>

      <div class="filtri__azioni-rapide">
        <label class="filtri__periodo">
          <span class="sr-only">Periodo</span>
          <select
            :value="modelValue.periodo"
            aria-label="Periodo"
            @change="aggiornaPeriodo($event.target.value)"
          >
            <option v-for="periodo in PERIODI_MOVIMENTI" :key="periodo.id" :value="periodo.id">
              {{ periodo.label }}
            </option>
          </select>
        </label>

        <button
          type="button"
          class="filtri__apri"
          :aria-expanded="pannelloAperto"
          @click="pannelloAperto = true"
        >
          <SlidersHorizontal :size="18" :stroke-width="1.75" aria-hidden="true" />
          Filtri
          <span v-if="attivi.length" class="filtri__conteggio">{{ attivi.length }}</span>
        </button>
      </div>
    </div>

    <div v-if="recenti.length" class="filtri__recenti">
      <span class="filtri__recenti-titolo">Categorie recenti</span>
      <button
        v-for="categoria in recenti"
        :key="categoria.id"
        type="button"
        class="filtri__chip"
        :class="{ 'filtri__chip--attivo': modelValue.categoria === categoria.id }"
        :aria-pressed="modelValue.categoria === categoria.id"
        @click="aggiorna('categoria', modelValue.categoria === categoria.id ? '' : categoria.id)"
      >
        {{ categoria.emoji }} {{ categoria.nome }}
      </button>
    </div>

    <div v-if="attivi.length" class="filtri__attivi">
      <button
        v-for="filtro in attivi"
        :key="filtro.chiave"
        type="button"
        class="filtri__attivo"
        @click="rimuovi(filtro.chiave)"
      >
        {{ filtro.etichetta }}
        <X :size="16" :stroke-width="2" aria-hidden="true" />
        <span class="sr-only">Rimuovi il filtro {{ filtro.etichetta }}</span>
      </button>

      <button type="button" class="filtri__azzera" @click="emit('azzera')">
        Azzera filtri
      </button>
    </div>

    <BottomSheet
      :open="pannelloAperto"
      title="Filtri"
      elevated
      @close="pannelloAperto = false"
    >
      <div class="pannello pannello--movimenti">
        <label class="pannello__campo">
          <span class="pannello__etichetta">Cerca nella descrizione</span>
          <span class="pannello__ricerca">
            <Search :size="18" :stroke-width="1.75" aria-hidden="true" />
            <input
              type="search"
              :value="modelValue.cerca"
              placeholder="Per esempio: supermercato"
              maxlength="100"
              @input="aggiorna('cerca', $event.target.value)"
            >
          </span>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Periodo</span>
          <select :value="modelValue.periodo" @change="aggiornaPeriodo($event.target.value)">
            <option v-for="periodo in PERIODI_MOVIMENTI" :key="periodo.id" :value="periodo.id">
              {{ periodo.label }}
            </option>
          </select>
        </label>

        <label v-if="modelValue.periodo === 'anno'" class="pannello__campo">
          <span class="pannello__etichetta">Anno</span>
          <select :value="modelValue.anno" @change="aggiorna('anno', Number($event.target.value))">
            <option v-for="anno in anniDisponibili" :key="anno" :value="anno">{{ anno }}</option>
          </select>
        </label>

        <div v-if="modelValue.periodo === 'personalizzato'" class="pannello__intervallo">
          <label class="pannello__campo">
            <span class="pannello__etichetta">Dal</span>
            <input
              type="date"
              :value="modelValue.da"
              :max="modelValue.a || undefined"
              @change="aggiorna('da', $event.target.value)"
            >
          </label>
          <label class="pannello__campo">
            <span class="pannello__etichetta">Al</span>
            <input
              type="date"
              :value="modelValue.a"
              :min="modelValue.da || undefined"
              @change="aggiorna('a', $event.target.value)"
            >
          </label>
        </div>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Conto</span>
          <select :value="modelValue.conto" @change="aggiorna('conto', $event.target.value)">
            <option value="">Tutti i conti</option>
            <option v-for="conto in conti" :key="conto.id" :value="conto.id">{{ conto.nome }}</option>
          </select>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Categoria</span>
          <select
            :value="modelValue.categoria"
            :disabled="modelValue.tipo === 'trasferimento'"
            @change="aggiorna('categoria', $event.target.value)"
          >
            <option value="">
              {{ modelValue.tipo === 'trasferimento' ? 'Non disponibile per i trasferimenti' : 'Tutte le categorie' }}
            </option>
            <optgroup v-for="gruppo in categoriePerGruppo" :key="gruppo.nome" :label="gruppo.nome">
              <option v-for="categoria in gruppo.categorie" :key="categoria.id" :value="categoria.id">
                {{ categoria.emoji }} {{ categoria.nome }}
              </option>
            </optgroup>
          </select>
        </label>

        <label class="pannello__campo">
          <span class="pannello__etichetta">Ordina per</span>
          <select :value="modelValue.ordine" @change="aggiorna('ordine', $event.target.value)">
            <option v-for="ordine in ORDINI_MOVIMENTI" :key="ordine.id" :value="ordine.id">
              {{ ordine.label }}
            </option>
          </select>
        </label>

        <div class="pannello__azioni">
          <button type="button" class="pannello__secondario" @click="emit('azzera')">
            Azzera filtri
          </button>
          <button type="button" class="pannello__primario" @click="pannelloAperto = false">
            Mostra {{ risultati }} {{ risultati === 1 ? 'movimento' : 'movimenti' }}
          </button>
        </div>
      </div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.filtri { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-5); }

.filtri__rapidi {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.filtri__tipi,
.filtri__recenti,
.filtri__attivi,
.filtri__azioni-rapide {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.filtri__recenti-titolo {
  width: 100%;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.filtri__chip,
.filtri__apri,
.filtri__attivo,
.filtri__azzera {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  background: var(--glass-interactive-bg);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}

.filtri__chip:hover,
.filtri__apri:hover,
.filtri__attivo:hover { background: var(--glass-interactive-bg-hover); }

.filtri__chip:focus-visible,
.filtri__apri:focus-visible,
.filtri__attivo:focus-visible,
.filtri__azzera:focus-visible,
.filtri__periodo select:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.filtri__chip--attivo {
  background: var(--accent-light);
  border-color: var(--border-focus);
  color: var(--text-primary);
}

.filtri__periodo select {
  min-height: 44px;
  padding: 0 calc(var(--space-6) + var(--space-2)) 0 var(--space-3);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  background-color: var(--glass-interactive-bg);
  color: var(--text-primary);
  font-size: 16px;
  cursor: pointer;
}

.filtri__conteggio {
  min-width: 22px;
  min-height: 22px;
  display: inline-grid;
  place-items: center;
  padding: 0 var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--accent-green);
  color: var(--accent-on);
  font-size: var(--text-xs);
  text-align: center;
}

.filtri__azzera { border-style: dashed; }

.pannello { display: flex; flex-direction: column; gap: var(--space-4); }
.pannello__campo { display: flex; flex-direction: column; gap: var(--space-2); }

.pannello__etichetta {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.pannello__campo select,
.pannello__campo input {
  min-height: 44px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 16px;
}

.pannello__campo select:disabled { opacity: 0.65; cursor: not-allowed; }

.pannello__campo select:focus-visible,
.pannello__campo input:focus-visible {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.pannello__ricerca { position: relative; display: flex; align-items: center; }
.pannello__ricerca svg { position: absolute; left: var(--space-3); color: var(--text-muted); }
.pannello__ricerca input { width: 100%; padding-left: calc(var(--space-6) + 18px); }

.pannello__intervallo { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.pannello__azioni { display: flex; gap: var(--space-3); padding-top: var(--space-2); }

.pannello__primario,
.pannello__secondario {
  flex: 1;
  min-height: 44px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
}

.pannello__primario {
  border: none;
  background: var(--accent-green);
  color: var(--accent-on);
}

.pannello__secondario {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}

.pannello__primario:focus-visible,
.pannello__secondario:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (max-width: 767px) {
  .filtri__tipi { flex-wrap: nowrap; width: 100%; overflow-x: auto; padding-bottom: var(--space-1); }
  .filtri__azioni-rapide { width: 100%; justify-content: space-between; }
  .filtri__periodo { flex: 1; }
  .filtri__periodo select { width: 100%; }
  .pannello__intervallo { grid-template-columns: 1fr; }
  .pannello__azioni { flex-direction: column-reverse; }
}

/* Il BottomSheet condiviso resta un foglio dal basso su mobile. Solo quando
   contiene questo pannello, su desktop si posa come drawer laterale. */
@media (min-width: 768px) {
  :global(.sheet-overlay:has(.pannello--movimenti)) {
    align-items: stretch;
    justify-content: flex-end;
  }

  :global(.sheet-overlay:has(.pannello--movimenti) .sheet) {
    width: min(28rem, 100vw);
    height: 100%;
    max-height: 100dvh;
    border-radius: var(--radius-xl) 0 0 var(--radius-xl);
    border-bottom: 1px solid var(--glass-elevated-border);
    padding: var(--space-5) var(--space-6);
  }

  :global(.sheet-overlay:has(.pannello--movimenti) .sheet__handle) { display: none; }

  :global(.sheet-enter-from:has(.pannello--movimenti) .sheet),
  :global(.sheet-leave-to:has(.pannello--movimenti) .sheet) {
    transform: translateX(100%);
  }
}
</style>
