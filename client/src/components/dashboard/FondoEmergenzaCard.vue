<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WModal from '@/components/common/WModal.vue';
import DataState from '@/components/common/DataState.vue';
import { useValuta } from '@/composables/useValuta';
import { Shield } from '@/utils/appIcons';
import { MESI_TARGET_AMMESSI, MESI_TARGET_DEFAULT, formattaMesi } from '@/utils/fondoEmergenza';

/**
 * Il fondo di emergenza in fondo alla home, con un ciclo di vita: finché il
 * conto non esiste è un invito a crearlo; appena esiste diventa la sintesi
 * cliccabile che porta alla sua pagina. Una cosa sola che cambia stato, non un
 * invito che resta per sempre a chiedere qualcosa di già fatto.
 *
 * I numeri non vengono calcolati qui: arrivano da GET /fondo-emergenza
 * (services/fondoEmergenza.service.js è il punto sorgente unico). Quando lo
 * storico non basta la card non inventa una cifra: dice che la copertura si
 * vedrà più avanti, ed è lo stato normale di chi ha appena iniziato.
 */
const props = defineProps({
  fondo: { type: Object, default: null },
  stato: { type: String, default: 'pronto' },
  lastUpdated: { type: Number, default: null },
  creazioneInCorso: { type: Boolean, default: false },
});

const emit = defineEmits(['crea', 'riprova']);
const router = useRouter();
const { formatValuta } = useValuta();

const confermaAperta = ref(false);
const mesiScelti = ref(MESI_TARGET_DEFAULT);

const esiste = computed(() => !!props.fondo?.esiste);
const copertura = computed(() => props.fondo?.copertura || null);
const mesiCoperti = computed(() => copertura.value?.mesi_copertura ?? null);
const speseEssenziali = computed(() => copertura.value?.spese_essenziali_mensili ?? null);

/** La percentuale serve solo alla barra: senza soglia non c'è barra, e non si
 * finge un progresso su un traguardo che non conosciamo. */
const progresso = computed(() => {
  const soglia = props.fondo?.soglia_euro;
  if (!soglia) return null;
  return Math.min(100, Math.round((props.fondo.importo / soglia) * 100));
});

const frasePronta = computed(() => {
  if (mesiCoperti.value === null) return null;
  const mesi = mesiCoperti.value;
  const target = props.fondo?.mesi_target;
  const coperti = formattaMesi(mesi);
  return target ? `${coperti} su ${target}` : coperti;
});

/** Cosa manca perché la copertura sia calcolabile. Sono i due soli motivi
 * possibili, e per entrambi c'è qualcosa da fare. */
const motivoSenzaCopertura = computed(() => {
  const stato = copertura.value?.stato;
  if (stato === 'dati_insufficienti') {
    return 'Registra un mese intero di spese e ti dirò quanti mesi copre.';
  }
  if (stato === 'non_calcolabile') {
    return 'Segna quali categorie sono essenziali e ti dirò quanti mesi copre.';
  }
  return null;
});

const apriConferma = () => {
  mesiScelti.value = MESI_TARGET_DEFAULT;
  confermaAperta.value = true;
};

const conferma = () => {
  emit('crea', mesiScelti.value);
};

const chiudiConferma = () => {
  confermaAperta.value = false;
};

defineExpose({ chiudiConferma });
</script>

<template>
  <section class="fondo-card">
    <div class="fondo-card__header">
      <h2 class="fondo-card__title">Fondo di emergenza</h2>
      <button v-if="esiste" type="button" class="fondo-card__link" @click="router.push('/fondo-emergenza')">
        Apri →
      </button>
    </div>

    <DataState :stato="stato" :last-updated="lastUpdated" @riprova="emit('riprova')">
      <WCard v-if="esiste" hoverable class="fondo-card__body">
        <button type="button" class="fondo-card__open" @click="router.push('/fondo-emergenza')">
          <span class="fondo-card__importo">{{ formatValuta(fondo.importo) }}</span>
          <span v-if="frasePronta" class="fondo-card__mesi">{{ frasePronta }} di spese essenziali</span>
          <span v-else class="fondo-card__mesi fondo-card__mesi--attesa">{{ motivoSenzaCopertura }}</span>

          <span v-if="progresso !== null" class="fondo-card__barra" aria-hidden="true">
            <span class="fondo-card__barra-riempita" :style="{ width: `${progresso}%` }" />
          </span>

          <span v-if="fondo.mancante" class="fondo-card__manca">
            Ti mancano {{ formatValuta(fondo.mancante) }} per la soglia che hai scelto
          </span>
          <span v-else-if="fondo.soglia_euro" class="fondo-card__manca fondo-card__manca--ok">
            Soglia raggiunta
          </span>
        </button>
      </WCard>

      <WCard v-else class="fondo-card__body fondo-card__body--invito">
        <Shield :size="24" :stroke-width="1.5" class="fondo-card__icona" />
        <p class="fondo-card__invito-title">Crea il conto di emergenza</p>
        <p class="fondo-card__invito-testo">
          Un conto separato per gli imprevisti: resta nel tuo patrimonio, ma fuori dai soldi
          spendibili, così non lo consumi senza accorgerti.
        </p>
        <p v-if="speseEssenziali" class="fondo-card__invito-dato">
          Le tue spese essenziali sono {{ formatValuta(speseEssenziali) }} al mese.
        </p>
        <WButton variant="primary" @click="apriConferma">Crea il conto</WButton>
      </WCard>
    </DataState>

    <WModal :open="confermaAperta" title="Creare il conto di emergenza?" @close="chiudiConferma">
      <p class="fondo-conferma__testo">
        Creo un conto separato, vuoto. I soldi che metterai dentro:
      </p>
      <ul class="fondo-conferma__elenco">
        <li>restano nel tuo patrimonio totale;</li>
        <li>non compaiono fra i soldi spendibili in home;</li>
        <li>si spostano solo con un trasferimento fra i tuoi conti, mai con una spesa.</li>
      </ul>

      <fieldset class="fondo-conferma__mesi">
        <legend>Quanti mesi di spese essenziali vuoi coprire?</legend>
        <div class="fondo-conferma__scelte">
          <label v-for="m in MESI_TARGET_AMMESSI" :key="m" class="fondo-conferma__scelta" :class="{ 'fondo-conferma__scelta--attiva': mesiScelti === m }">
            <input v-model="mesiScelti" type="radio" name="mesi-target" :value="m">
            <span>{{ m }} mesi</span>
          </label>
        </div>
        <p class="fondo-conferma__nota">Puoi cambiare questa soglia quando vuoi.</p>
      </fieldset>

      <div class="fondo-conferma__azioni">
        <WButton variant="ghost" @click="chiudiConferma">Annulla</WButton>
        <WButton variant="primary" :loading="creazioneInCorso" @click="conferma">Crea il conto</WButton>
      </div>
    </WModal>
  </section>
</template>

<style scoped>
.fondo-card {
  margin-top: 1.5rem;
}

.fondo-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.fondo-card__title {
  font-size: 1.0625rem;
  font-weight: 650;
  letter-spacing: var(--tracking-title);
  color: var(--text-primary);
}

.fondo-card__link {
  background: none;
  border: none;
  color: var(--text-link);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.fondo-card__link:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
}

/* Tutta la card è il bersaglio del tocco quando il fondo esiste: un riquadro
   che porta a una pagina non ha bisogno di un secondo pulsante dentro. */
.fondo-card__open {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.fondo-card__open:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-tight);
  border-radius: var(--radius-md);
}

.fondo-card__importo {
  font-size: 1.75rem;
  font-weight: 680;
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.fondo-card__mesi {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.fondo-card__mesi--attesa {
  color: var(--text-muted);
}

.fondo-card__barra {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-inset);
  overflow: hidden;
  margin-top: 0.25rem;
}

.fondo-card__barra-riempita {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent-green);
  transition: width var(--dur-slow) var(--ease-out);
}

.fondo-card__manca {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.fondo-card__manca--ok {
  color: var(--accent-text);
}

.fondo-card__body--invito {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.fondo-card__icona {
  color: var(--accent-text);
}

.fondo-card__invito-title {
  font-size: var(--text-base);
  font-weight: 620;
  color: var(--text-primary);
}

.fondo-card__invito-testo {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}

.fondo-card__invito-dato {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.fondo-conferma__testo {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.fondo-conferma__elenco {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0 0 1rem 1rem;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}

.fondo-conferma__mesi {
  border: none;
  padding: 0;
  margin: 0 0 1rem;
}

.fondo-conferma__mesi legend {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.fondo-conferma__scelte {
  display: flex;
  gap: 0.5rem;
}

.fondo-conferma__scelta {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
}

.fondo-conferma__scelta input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.fondo-conferma__scelta--attiva {
  border-color: var(--accent-green);
  color: var(--text-primary);
  font-weight: 600;
}

.fondo-conferma__scelta:focus-within {
  box-shadow: var(--focus-ring-tight);
}

.fondo-conferma__nota {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 0.5rem;
}

.fondo-conferma__azioni {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
