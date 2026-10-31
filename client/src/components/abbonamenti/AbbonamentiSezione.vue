<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAbbonamentiStore } from '@/stores/abbonamenti.store';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import DataState from '@/components/common/DataState.vue';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import AbbonamentoCard from './AbbonamentoCard.vue';
import AbbonamentiTotali from './AbbonamentiTotali.vue';
import AbbonamentoForm from './AbbonamentoForm.vue';
import ServizioIcona from './ServizioIcona.vue';
import { formatData } from '@/utils/formatters';
import { Repeat2 } from '@/utils/appIcons';

const emit = defineEmits(['vai-programmate']);

const store = useAbbonamentiStore();
const toastStore = useToastStore();
const authStore = useAuthStore();

const valuta = computed(() => authStore.user?.valuta || 'EUR');
const finestraAperta = ref(false);
const inModifica = ref(null);
const occupato = ref(false);
const mostraNonAttivi = ref(false);
const inRipristino = ref(null);

const titoloElenco = computed(() => {
  const numero = store.attivi.length;
  if (numero === 0) return 'Nessun abbonamento attivo';
  return numero === 1 ? '1 abbonamento attivo' : `${numero} abbonamenti attivi`;
});

onMounted(store.fetchAbbonamenti);

const apri = (abbonamento = null) => {
  inModifica.value = abbonamento;
  finestraAperta.value = true;
};
const chiudi = () => {
  if (!occupato.value) finestraAperta.value = false;
};

const messaggioErrore = (err, predefinito) => {
  const data = err.response?.data;
  return data?.errori?.[0]?.messaggio || data?.message || data?.error || predefinito;
};

const esegui = async (azione, conferma, errore) => {
  occupato.value = true;
  try {
    await azione();
    toastStore.success(conferma);
    finestraAperta.value = false;
  } catch (err) {
    toastStore.error(messaggioErrore(err, errore));
  } finally {
    occupato.value = false;
  }
};

const salva = (dati) => (inModifica.value
  ? esegui(() => store.modifica(inModifica.value.id, dati), 'Abbonamento aggiornato', 'Non è stato possibile aggiornare l’abbonamento')
  : esegui(() => store.crea(dati), 'Abbonamento aggiunto', 'Non è stato possibile aggiungere l’abbonamento'));

const annulla = () => esegui(
  () => store.annulla(inModifica.value.id),
  'Abbonamento annullato: non conta più nei totali',
  'Non è stato possibile annullare l’abbonamento',
);

const escludi = () => esegui(
  () => store.escludi(inModifica.value.id),
  'Fatto: non verrà più aggiunto da solo',
  'Non è stato possibile escluderlo',
);

const vaiProgrammate = () => {
  finestraAperta.value = false;
  emit('vai-programmate');
};

const ripristina = async (abbonamento) => {
  inRipristino.value = abbonamento.id;
  try {
    await store.ripristina(abbonamento.id);
    toastStore.success('Abbonamento ripristinato');
  } catch (err) {
    toastStore.error(messaggioErrore(err, 'Non è stato possibile ripristinarlo'));
  } finally {
    inRipristino.value = null;
  }
};

const statoNonAttivo = (abbonamento) => {
  if (abbonamento.stato_effettivo === 'escluso') return 'Non è un abbonamento';
  if (abbonamento.stato_effettivo === 'finito') return `Finito il ${formatData(abbonamento.data_fine, 'medio')}`;
  return abbonamento.annullato_il ? `Annullato il ${formatData(abbonamento.annullato_il, 'medio')}` : 'Annullato';
};
</script>

<template>
  <div class="abbonamenti">
    <DataState
      :stato="store.stato"
      :last-updated="store.lastUpdated"
      messaggio-errore="Non è stato possibile caricare gli abbonamenti."
      skeleton-type="card"
      :skeleton-lines="4"
      @riprova="store.fetchAbbonamenti"
    >
      <template #vuoto>
        <WCard class="abbonamenti__vuoto">
          <span class="abbonamenti__vuoto-icona"><Repeat2 :size="30" aria-hidden="true" /></span>
          <h2>Nessun abbonamento, per ora</h2>
          <p>Quando registri un pagamento come Netflix o Spotify, WALLT lo aggiunge qui da solo. Puoi anche aggiungerlo tu.</p>
          <WButton variant="primary" size="md" @click="apri()">+ Aggiungi</WButton>
        </WCard>
      </template>

      <div class="abbonamenti__contenuto">
        <div class="abbonamenti__testa">
          <h2>{{ titoloElenco }}</h2>
          <WButton variant="primary" size="sm" aria-label="Aggiungi un abbonamento" @click="apri()">+ Aggiungi</WButton>
        </div>

        <AbbonamentoCard
          v-for="abbonamento in store.attivi"
          :key="abbonamento.id"
          :abbonamento="abbonamento"
          :valuta="valuta"
          @apri="apri"
        />

        <AbbonamentiTotali v-if="store.attivi.length && store.totali" :totali="store.totali" :valuta="valuta" />

        <template v-if="store.nonAttivi.length">
          <button type="button" class="abbonamenti__mostra" :aria-expanded="mostraNonAttivi" @click="mostraNonAttivi = !mostraNonAttivi">
            {{ mostraNonAttivi ? 'Nascondi annullati' : `Mostra annullati (${store.nonAttivi.length})` }}
          </button>
          <ul v-if="mostraNonAttivi" class="abbonamenti__non-attivi">
            <li v-for="abbonamento in store.nonAttivi" :key="abbonamento.id">
              <ServizioIcona :icona="abbonamento.icona" :nome="abbonamento.nome" :size="36" />
              <span class="abbonamenti__non-attivo-testo">
                <strong>{{ abbonamento.nome }}</strong>
                <span>{{ statoNonAttivo(abbonamento) }}</span>
              </span>
              <WButton
                variant="secondary"
                size="sm"
                :loading="inRipristino === abbonamento.id"
                :disabled="Boolean(inRipristino)"
                :aria-label="`Ripristina ${abbonamento.nome}`"
                @click="ripristina(abbonamento)"
              >Ripristina</WButton>
            </li>
          </ul>
        </template>
      </div>
    </DataState>

    <AppDialog :open="finestraAperta" :title="inModifica ? 'Modifica abbonamento' : 'Nuovo abbonamento'" @close="chiudi">
      <AbbonamentoForm
        :key="inModifica?.id ?? 'nuovo'"
        :abbonamento="inModifica"
        :valuta="valuta"
        :occupato="occupato"
        @salva="salva"
        @annulla="annulla"
        @escludi="escludi"
        @vai-programmate="vaiProgrammate"
      />
    </AppDialog>
  </div>
</template>

<style scoped>
.abbonamenti__contenuto { display: flex; flex-direction: column; gap: 0.75rem; }
.abbonamenti__testa { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.abbonamenti__testa h2 { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
.abbonamenti__vuoto { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2.5rem 1.25rem !important; text-align: center; }
.abbonamenti__vuoto-icona { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; color: var(--accent-green); background: color-mix(in srgb, var(--accent-green) 10%, transparent); }
.abbonamenti__vuoto h2 { margin: 0.5rem 0 0; color: var(--text-primary); font-size: 1rem; }
.abbonamenti__vuoto p { margin: 0 0 0.5rem; max-width: 26rem; color: var(--text-muted); font-size: var(--text-xs); line-height: 1.5; }
.abbonamenti__mostra {
  align-self: center;
  min-height: 40px;
  padding: 0.25rem 0.75rem;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}
.abbonamenti__mostra:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
.abbonamenti__non-attivi { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.abbonamenti__non-attivi li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
  background: var(--glass-secondary-bg);
}
.abbonamenti__non-attivo-testo { display: flex; flex: 1; flex-direction: column; gap: 0.1rem; min-width: 0; font-size: var(--text-xs); }
.abbonamenti__non-attivo-testo strong { color: var(--text-primary); font-weight: 650; overflow-wrap: anywhere; }
.abbonamenti__non-attivo-testo span { color: var(--text-muted); }
</style>
