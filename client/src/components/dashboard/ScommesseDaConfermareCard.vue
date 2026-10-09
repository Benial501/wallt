<script setup>
import { computed, ref } from 'vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import { useValuta } from '@/composables/useValuta';
import dayjs from 'dayjs';

/**
 * Le operazioni che la banca ha portato verso un operatore di gioco e che
 * nessuno ha ancora attribuito a una piattaforma.
 *
 * Esiste perché senza questa risposta il saldo di gioco in WALLT resta
 * sbagliato: la riga bancaria da sola dice che 50 € sono usciti dal conto, non
 * che sono arrivati su SNAI. WALLT non indovina — la piattaforma la sceglie
 * chi ha fatto il deposito.
 *
 * La card non esiste quando non c'è niente da confermare: non è un pannello
 * che resta a chiedere qualcosa di già fatto.
 */
const props = defineProps({
  proposte: { type: Array, default: () => [] },
  piattaforme: { type: Array, default: () => [] },
});

const emit = defineEmits(['conferma', 'archivia']);
const { formatValuta } = useValuta();

/** La piattaforma scelta per ciascuna proposta, finché non si conferma. */
const scelte = ref({});
const inCorso = ref(null);

const piattaformeAttive = computed(() => props.piattaforme.filter((p) => p.attiva !== false));

const scelta = (proposta) => scelte.value[proposta.id]
  ?? (piattaformeAttive.value.length === 1 ? piattaformeAttive.value[0].id : null);

const etichetta = (proposta) => (proposta.categoria === 'prelievo_scommesse'
  ? 'Prelievo ricevuto'
  : 'Deposito registrato');

const quando = (proposta) => {
  const d = dayjs(proposta.data);
  if (d.isSame(dayjs(), 'day')) return 'oggi';
  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) return 'ieri';
  return `il ${d.format('D MMMM')}`;
};

const conferma = async (proposta) => {
  const piattaformaId = scelta(proposta);
  if (!piattaformaId) return;
  inCorso.value = proposta.id;
  try {
    emit('conferma', { movimentoId: proposta.id, piattaformaId });
  } finally {
    inCorso.value = null;
  }
};
</script>

<template>
  <section v-if="proposte.length" class="conferme-card" aria-label="Operazioni di gioco da confermare">
    <h2 class="conferme-card__title">
      {{ proposte.length === 1 ? 'Un’operazione da confermare' : 'Operazioni da confermare' }}
    </h2>
    <p class="conferme-card__intro">
      Il conto collegato ha registrato queste operazioni verso operatori di gioco.
      Dicci su quale piattaforma è andato il denaro: il saldo di gioco non si
      aggiorna da sé.
    </p>

    <WCard v-for="proposta in proposte" :key="proposta.id" class="conferme-card__riga">
      <div class="conferme-card__intestazione">
        <span class="conferme-card__importo">{{ formatValuta(proposta.importo) }}</span>
        <span class="conferme-card__meta">{{ etichetta(proposta) }} {{ quando(proposta) }}</span>
      </div>
      <p class="conferme-card__descrizione">{{ proposta.descrizione }}</p>

      <div class="conferme-card__azioni">
        <label class="conferme-card__label" :for="`piattaforma-${proposta.id}`">Piattaforma</label>
        <select
          :id="`piattaforma-${proposta.id}`"
          v-model="scelte[proposta.id]"
          class="form-input conferme-card__select"
        >
          <option :value="null" disabled>Scegli…</option>
          <option v-for="p in piattaformeAttive" :key="p.id" :value="p.id">{{ p.nome }}</option>
        </select>

        <WButton
          type="button"
          :disabled="!scelta(proposta) || inCorso === proposta.id"
          @click="conferma(proposta)"
        >
          Conferma
        </WButton>
        <button
          type="button"
          class="conferme-card__ignora"
          @click="emit('archivia', proposta.id)"
        >
          Non è un’operazione di gioco
        </button>
      </div>
    </WCard>
  </section>
</template>

<style scoped>
.conferme-card {
  margin-bottom: var(--space-5, 1.25rem);
}

.conferme-card__title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.conferme-card__intro {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0.25rem 0 0.75rem;
}

.conferme-card__riga + .conferme-card__riga {
  margin-top: 0.75rem;
}

.conferme-card__intestazione {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.conferme-card__importo {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.conferme-card__meta,
.conferme-card__descrizione {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.conferme-card__descrizione {
  margin: 0.25rem 0 0.75rem;
  word-break: break-word;
}

.conferme-card__azioni {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.conferme-card__label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.conferme-card__select {
  min-width: 10rem;
  flex: 1 1 10rem;
}

.conferme-card__ignora {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
}
</style>
