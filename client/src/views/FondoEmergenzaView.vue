<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import DataState from '@/components/common/DataState.vue';
import CreaFondoEmergenzaModal from '@/components/dashboard/CreaFondoEmergenzaModal.vue';
import MovimentoForm from '@/components/movimenti/MovimentoForm.vue';
import { useFondoEmergenzaStore } from '@/stores/fondoEmergenza.store';
import { useContiStore } from '@/stores/conti.store';
import { useValuta } from '@/composables/useValuta';
import { useToastStore } from '@/stores/toast.store';
import { MESI_TARGET_AMMESSI, formattaMesi } from '@/utils/fondoEmergenza';
import { Shield } from '@/utils/appIcons';

/**
 * La pagina del fondo di emergenza: quanto c'è, per quanti mesi basterebbe, e
 * quanto manca alla soglia scelta.
 *
 * Nessun numero viene calcolato qui. Arrivano tutti da GET /fondo-emergenza,
 * dove `services/fondoEmergenza.service.js` è il punto sorgente unico: la
 * pagina sceglie solo cosa mostrare, e soprattutto cosa NON mostrare quando i
 * dati non bastano.
 *
 * Gli stati "non calcolabile" e "dati insufficienti" non sono casi limite: sono
 * la condizione normale di chi ha appena iniziato, e per questo hanno una
 * spiegazione e un'azione invece di un trattino.
 */
const store = useFondoEmergenzaStore();
const contiStore = useContiStore();
const router = useRouter();
const toast = useToastStore();
const { formatValuta } = useValuta();

const trasferimentoAperto = ref(false);
const salvataggioMesi = ref(false);
const creazioneAperta = ref(false);
const creazioneInCorso = ref(false);

const fondo = computed(() => store.fondo);
const copertura = computed(() => fondo.value?.copertura || null);
const mesiCoperti = computed(() => copertura.value?.mesi_copertura ?? null);
const speseEssenziali = computed(() => copertura.value?.spese_essenziali_mensili ?? null);
const mesiTarget = computed(() => fondo.value?.mesi_target ?? null);

const progresso = computed(() => {
  const soglia = fondo.value?.soglia_euro;
  if (!soglia) return null;
  return Math.min(100, Math.round((fondo.value.importo / soglia) * 100));
});

/** Il periodo davvero osservato, che non coincide con quello richiesto quando
 * lo storico è più corto: dirlo evita di far credere che la media venga da tre
 * mesi quando ne è stato usato uno. */
const periodoOsservato = computed(() => {
  const p = copertura.value?.periodo;
  if (!p?.da) return null;
  return p.da === p.a ? p.da : `${p.da} → ${p.a}`;
});

const statoDati = computed(() => copertura.value?.stato || null);

const creaFondo = async (mesiTarget) => {
  if (creazioneInCorso.value) return;
  creazioneInCorso.value = true;
  try {
    await store.creaFondo({ mesiTarget });
    creazioneAperta.value = false;
    await Promise.all([contiStore.fetchConti(), contiStore.fetchPatrimonio()]);
    toast.success('Fondo di emergenza creato. Puoi alimentarlo con un trasferimento.');
  } catch (error) {
    toast.error(error.response?.data?.message || 'Non riesco a creare il fondo di emergenza');
  } finally {
    creazioneInCorso.value = false;
  }
};

const cambiaMesi = async (mesi) => {
  if (mesi === mesiTarget.value) return;
  salvataggioMesi.value = true;
  try {
    await store.aggiornaMesiTarget(mesi);
    toast.success(`Soglia aggiornata a ${formattaMesi(mesi)}`);
  } catch {
    toast.error('Non riesco ad aggiornare la soglia');
  } finally {
    salvataggioMesi.value = false;
  }
};

const dopoTrasferimento = async () => {
  trasferimentoAperto.value = false;
  await Promise.all([store.fetchFondo(), contiStore.fetchConti(), contiStore.fetchPatrimonio()]);
};

onMounted(() => {
  store.fetchFondo();
  if (!contiStore.conti.length) contiStore.fetchConti();
});
</script>

<template>
  <div class="fondo-view animate-fade-in">
    <header class="fondo-view__header">
      <button type="button" class="fondo-view__back" @click="router.push('/dashboard')">← Home</button>
      <h1 class="fondo-view__title">
        <Shield :size="20" :stroke-width="1.75" />
        Fondo di emergenza
      </h1>
      <p class="fondo-view__sub">
        Un conto separato per gli imprevisti. Resta nel tuo patrimonio, ma fuori dai soldi
        spendibili: i soldi entrano ed escono solo con un trasferimento fra i tuoi conti.
      </p>
    </header>

    <DataState
      :stato="store.risorsaFondo.stato"
      :last-updated="store.risorsaFondo.lastUpdated"
      @riprova="store.risorsaFondo.riprova()"
    >
      <template v-if="fondo && !fondo.esiste">
        <WCard class="fondo-view__vuoto">
          <p class="fondo-view__vuoto-title">Non hai ancora un fondo di emergenza</p>
          <p class="fondo-view__vuoto-testo">
            Crea qui un conto separato per gli imprevisti. Nasce vuoto e potrai alimentarlo
            in seguito con un trasferimento da un altro conto.
          </p>
          <WButton variant="primary" @click="creazioneAperta = true">Crea il conto di emergenza</WButton>
        </WCard>
      </template>

      <template v-else-if="fondo">
        <WCard class="fondo-view__saldo">
          <p class="fondo-view__kicker">Nel fondo</p>
          <strong class="fondo-view__importo">{{ formatValuta(fondo.importo) }}</strong>

          <p v-if="mesiCoperti !== null" class="fondo-view__copertura">
            Coprirebbe <strong>{{ formattaMesi(mesiCoperti) }}</strong> di spese essenziali
          </p>

          <div v-if="progresso !== null" class="fondo-view__barra" role="img" :aria-label="`${progresso}% della soglia`">
            <span class="fondo-view__barra-riempita" :style="{ width: `${progresso}%` }" />
          </div>

          <p v-if="fondo.mancante" class="fondo-view__manca">
            Ti mancano {{ formatValuta(fondo.mancante) }} per arrivare a
            {{ formattaMesi(mesiTarget) }} ({{ formatValuta(fondo.soglia_euro) }}).
          </p>
          <p v-else-if="fondo.soglia_euro" class="fondo-view__manca fondo-view__manca--ok">
            Hai raggiunto la soglia di {{ formattaMesi(mesiTarget) }}.
          </p>

          <WButton variant="primary" @click="trasferimentoAperto = true">
            Sposta denaro nel fondo
          </WButton>
        </WCard>

        <section class="fondo-view__sezione">
          <h2 class="fondo-view__sezione-title">Quanto ti serve</h2>

          <WCard v-if="statoDati === 'disponibile'" class="fondo-view__dati">
            <div class="fondo-view__riga">
              <span>Spese essenziali al mese</span>
              <strong>{{ formatValuta(speseEssenziali) }}</strong>
            </div>
            <div class="fondo-view__riga">
              <span>Soglia scelta ({{ formattaMesi(mesiTarget) }})</span>
              <strong>{{ formatValuta(fondo.soglia_euro) }}</strong>
            </div>
            <div class="fondo-view__riga">
              <span>Nel fondo oggi</span>
              <strong>{{ formatValuta(fondo.importo) }}</strong>
            </div>
            <div class="fondo-view__riga fondo-view__riga--somma">
              <span>Ancora da mettere da parte</span>
              <strong>{{ formatValuta(fondo.mancante) }}</strong>
            </div>

            <p v-if="periodoOsservato" class="fondo-view__nota">
              Media calcolata sui mesi di calendario completi osservati
              ({{ periodoOsservato }}): il mese in corso non entra.
              <span v-if="copertura.storico_limitato">
                Hai meno storico dei {{ formattaMesi(copertura.mesi_richiesti) }} richiesti,
                quindi la media può cambiare.
              </span>
            </p>
            <p v-if="copertura.classificazione_incompleta" class="fondo-view__avviso">
              Una parte delle tue uscite non ha una categoria classificata: le spese
              essenziali potrebbero essere più alte di così.
              <button type="button" class="fondo-view__inline-link" @click="router.push('/impostazioni/categorie')">
                Classifica le categorie
              </button>
            </p>
          </WCard>

          <WCard v-else class="fondo-view__dati">
            <p class="fondo-view__vuoto-title">
              {{ statoDati === 'non_calcolabile'
                ? 'Non so ancora quali spese sono essenziali per te'
                : 'Non ho ancora abbastanza storico' }}
            </p>
            <p class="fondo-view__vuoto-testo">
              {{ statoDati === 'non_calcolabile'
                ? 'Segna quali categorie sono essenziali: da quelle calcolo di quanto hai bisogno ogni mese, e quindi quanto ti serve nel fondo.'
                : 'Serve almeno un mese di calendario completo di spese registrate. Il mese in corso non entra nella media, perché non è ancora finito.' }}
            </p>
            <WButton
              v-if="statoDati === 'non_calcolabile'"
              variant="secondary"
              @click="router.push('/impostazioni/categorie')"
            >
              Classifica le categorie
            </WButton>
            <WButton v-else variant="secondary" @click="router.push('/movimenti')">
              Vai ai movimenti
            </WButton>
          </WCard>
        </section>

        <section class="fondo-view__sezione">
          <h2 class="fondo-view__sezione-title">La tua soglia</h2>
          <WCard class="fondo-view__soglia">
            <p class="fondo-view__vuoto-testo">
              Quanti mesi di spese essenziali vuoi avere da parte. Tre mesi è un punto di
              partenza ragionevole; sei o dodici danno più margine se le tue entrate sono
              variabili.
            </p>
            <div class="fondo-view__scelte">
              <button
                v-for="m in MESI_TARGET_AMMESSI"
                :key="m"
                type="button"
                class="fondo-view__scelta"
                :class="{ 'fondo-view__scelta--attiva': mesiTarget === m }"
                :disabled="salvataggioMesi"
                @click="cambiaMesi(m)"
              >
                {{ m }} mesi
              </button>
            </div>
          </WCard>
        </section>
      </template>
    </DataState>

    <CreaFondoEmergenzaModal
      :open="creazioneAperta"
      :loading="creazioneInCorso"
      @close="creazioneAperta = false"
      @crea="creaFondo"
    />

    <MovimentoForm
      :open="trasferimentoAperto"
      tipo="trasferimento"
      @close="trasferimentoAperto = false"
      @saved="dopoTrasferimento"
    />
  </div>
</template>

<style scoped>
.fondo-view {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 2rem;
}

.fondo-view__header {
  margin-bottom: 1.25rem;
}

.fondo-view__back {
  background: none;
  border: none;
  padding: 0;
  margin-bottom: 0.75rem;
  color: var(--text-link);
  font-size: var(--text-xs);
  cursor: pointer;
}

.fondo-view__back:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}

.fondo-view__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.375rem;
  font-weight: 680;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.fondo-view__sub {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text-secondary);
}

.fondo-view__saldo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.fondo-view__kicker {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.fondo-view__importo {
  font-size: 2.25rem;
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.fondo-view__copertura {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.fondo-view__barra {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-inset);
  overflow: hidden;
  margin: 0.25rem 0;
}

.fondo-view__barra-riempita {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent-green);
  transition: width var(--dur-slow) var(--ease-out);
}

.fondo-view__manca {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}

.fondo-view__manca--ok {
  color: var(--accent-text);
}

.fondo-view__sezione {
  margin-top: 1.75rem;
}

.fondo-view__sezione-title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.fondo-view__dati,
.fondo-view__soglia {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  align-items: flex-start;
}

.fondo-view__riga {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
  width: 100%;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.fondo-view__riga strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

/* L'ultima riga è il risultato delle altre: il filo sopra lo dice senza
   scriverlo. */
.fondo-view__riga--somma {
  border-top: 1px solid var(--border);
  padding-top: 0.625rem;
}

.fondo-view__nota,
.fondo-view__avviso {
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--text-muted);
}

.fondo-view__inline-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-link);
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.fondo-view__vuoto {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.fondo-view__vuoto-title {
  font-size: var(--text-base);
  font-weight: 620;
  color: var(--text-primary);
}

.fondo-view__vuoto-testo {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text-secondary);
}

.fondo-view__scelte {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}

.fondo-view__scelta {
  flex: 1;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: none;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
}

.fondo-view__scelta--attiva {
  border-color: var(--accent-green);
  color: var(--text-primary);
  font-weight: 600;
}

.fondo-view__scelta:disabled {
  opacity: 0.6;
  cursor: default;
}

.fondo-view__scelta:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}
</style>
