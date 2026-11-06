<script setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import StatoRiga from '@/components/situazione/StatoRiga.vue';
import { usePianoSmartStore } from '@/stores/pianoSmart.store';
import { purchaseAmountCents } from '@/utils/pianoSmartSimulation';
import { formattaEuro } from '@/utils/pianoSmart';
import {
  statoOggi, rispostaSimulazione, composizioneSpendibile, entrateInArrivo, ritmoSpesa,
} from '@/utils/situazioneSemplice';

/**
 * Oggi, in forma semplice ma a 360 gradi: quanto puoi spendere, come ci si
 * arriva (conti − spese da coprire − obiettivi), cosa sta per entrare, come
 * stai andando e una domanda sola per il simulatore. Nessun calcolo: i
 * valori arrivano da `current-situation`.
 *
 * Le entrate future restano FUORI dal numero, di proposito: se una pensione
 * o un pagamento ritarda, chi ha speso contando su quei soldi resta scoperto.
 * La pagina le mostra e dice perché non le conta.
 */
const props = defineProps({
  situazione: { type: Object, required: true },
});
const emit = defineEmits(['suggerimento']);

const store = usePianoSmartStore();
const { purchaseSimulation, purchaseSimulationState } = storeToRefs(store);

const h = computed(() => props.situazione.horizon ?? {});
const dataLunga = (iso) => (iso
  ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
  : '');
const dataBreve = (iso) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

const spendibile = computed(() => h.value.capitaleLibero ?? props.situazione.current?.availableToSpend ?? null);
const stato = computed(() => statoOggi(props.situazione, { euro: formattaEuro, data: dataLunga }));
const daPagare = computed(() => props.situazione.upcoming?.items ?? []);
const composizione = computed(() => composizioneSpendibile(props.situazione));
// Le voci esatte degli impegni esistono solo per il ciclo mensile; con una
// data scelta dall'utente gli impegni sono quelli fino a quella data, e
// l'elenco migliore resta quello delle scadenze.
const vociImpegni = computed(() => (h.value.tipo !== 'data' && props.situazione.current?.commitmentItems
  ? props.situazione.current.commitmentItems
  : daPagare.value.map((item) => ({ key: item.occurrenceKey, description: item.description, amount: item.amount, date: item.dueDate }))));
const entrate = computed(() => entrateInArrivo(props.situazione));
const ritmo = computed(() => ritmoSpesa(props.situazione, { euro: formattaEuro }));
const consiglio = computed(() => props.situazione.suggestions?.[0] ?? null);

const importo = ref('');
const errore = computed(() => importo.value !== '' && purchaseAmountCents(importo.value) === null);
const risposta = computed(() => rispostaSimulazione(purchaseSimulation.value, { euro: formattaEuro }));
const simulabile = computed(() => props.situazione.current?.availableToSpend !== null);
const verifica = async () => {
  if (!errore.value && importo.value && simulabile.value) await store.simulatePurchase(importo.value);
};
</script>

<template>
  <WCard class="oggi">
    <!-- Quando il server non può ancora stimare lo spendibile, un trattino
         grande sarebbe proprio il «numero messo lì a caso»: mostriamo ciò che
         è certo (i soldi sui conti, le spese già previste) e cosa manca. -->
    <div v-if="spendibile === null">
      <p class="etichetta">Sui tuoi conti hai</p>
      <strong class="numero">{{ formattaEuro(situazione.current?.liquidity) }}</strong>
      <p v-if="Number(h.impegniFinoA) > 0" class="sotto">
        Di questi, <strong>{{ formattaEuro(h.impegniFinoA) }}</strong> servono per le spese già previste fino al {{ dataLunga(h.dataFine) }}.
      </p>
      <p class="spiega">Per dirti quanto puoi spendere ogni giorno, WALLT deve vedere le tue spese per almeno un mese intero.</p>
    </div>
    <div v-else>
      <p class="etichetta">{{ h.tipo === 'data' ? `Per arrivare al ${dataLunga(h.dataFine)} puoi spendere ancora` : 'Puoi spendere ancora' }}</p>
      <strong class="numero">{{ formattaEuro(spendibile) }}</strong>
      <p v-if="h.budgetGiornaliero !== null && h.budgetGiornaliero !== undefined" class="sotto">
        <!-- Non «cioè»: il limite giornaliero può essere più basso della
             semplice divisione, quando lo frena la spesa media (vedi
             `dailyLimitBasis`). -->
        <template v-if="h.tipo !== 'data'">fino al {{ dataLunga(h.dataFine) }}. </template>Per arrivarci senza problemi, spendi al massimo <strong>{{ formattaEuro(h.budgetGiornaliero) }} al giorno</strong>.
      </p>
    </div>
    <StatoRiga v-if="spendibile !== null || stato.tono !== 'neutro'" :tono="stato.tono" :testo="stato.testo" />
    <p v-if="ritmo" class="testo testo--tenue">{{ ritmo.testo }}</p>
  </WCard>

  <WCard class="blocco">
    <h2>Come arriviamo a questo numero</h2>
    <dl v-if="composizione && spendibile !== null" class="conto">
      <div class="conto__riga"><dt>Sui tuoi conti hai</dt><dd>{{ formattaEuro(composizione.conti) }}</dd></div>
      <div class="conto__riga">
        <dt>
          Spese già previste da coprire
          <!-- In modalità mensile le voci sono esattamente quelle sottratte
               (`current.commitmentItems`), comprese le rate scadute e non
               segnate come pagate e quelle entro 30 giorni ma oltre la fine
               del mese: senza il loro nome una rata da 36 € compariva come
               «− 72 €» senza spiegazione. -->
          <ul v-if="vociImpegni.length" class="conto__voci">
            <li v-for="item in vociImpegni" :key="item.key">
              {{ item.description || 'Spesa prevista' }}<template v-if="item.date">, {{ dataBreve(item.date) }}</template>: {{ formattaEuro(item.amount) }}
              <span v-if="item.overdue" class="conto__avviso">
                Scaduta e non ancora segnata come pagata. Se l’hai già pagata,
                <RouterLink to="/funzionalita/situazione/programmate">segnala che è pagata</RouterLink>.
              </span>
              <span v-else-if="item.afterPeriodEnd" class="conto__nota-voce">Scade dopo fine mese, ma entro 30 giorni: la teniamo già da parte.</span>
            </li>
          </ul>
        </dt>
        <dd>− {{ formattaEuro(composizione.impegni) }}</dd>
      </div>
      <div v-if="composizione.obiettivi" class="conto__riga"><dt>Soldi messi da parte per i tuoi obiettivi</dt><dd>− {{ formattaEuro(composizione.obiettivi) }}</dd></div>
      <div v-if="composizione.riserva" class="conto__riga">
        <dt>
          Riserva per i mesi senza entrate
          <p class="conto__nota">
            Le tue entrate non arrivano sempre uguali, quindi teniamo da parte
            {{ situazione.current?.reserveMonths === 1 ? 'un mese' : `${situazione.current?.reserveMonths} mesi` }} di spese.
            Puoi cambiarlo in «Vedi i dettagli».
          </p>
        </dt>
        <dd>− {{ formattaEuro(composizione.riserva) }}</dd>
      </div>
      <div v-if="composizione.altro" class="conto__riga"><dt>Altro già tenuto da parte</dt><dd>− {{ formattaEuro(composizione.altro) }}</dd></div>
      <div class="conto__riga conto__riga--totale"><dt>Puoi spendere</dt><dd>{{ formattaEuro(composizione.risultato) }}</dd></div>
    </dl>
    <template v-else>
      <ul v-if="daPagare.length" class="righe">
        <li v-for="item in daPagare" :key="item.occurrenceKey">
          <span>{{ item.description || 'Spesa fissa' }} <small>· {{ dataBreve(item.dueDate) }}</small></span>
          <strong>{{ formattaEuro(item.amount) }}</strong>
        </li>
      </ul>
      <p v-else class="testo testo--tenue">Niente da pagare fino a fine mese.</p>
    </template>
    <p v-if="composizione && spendibile !== null && Number(composizione.risultato) === 0 && Number(h.mancanti) > 0" class="testo">
      Le spese da coprire superano i soldi che hai di {{ formattaEuro(h.mancanti) }}: per ora non c’è nulla da spendere liberamente.
    </p>
  </WCard>

  <WCard class="blocco">
    <h2>Soldi in arrivo</h2>
    <template v-if="entrate.entro.length || entrate.dopo.length">
      <ul class="righe">
        <li v-for="item in [...entrate.entro, ...entrate.dopo]" :key="item.occurrenceKey">
          <span>{{ item.description || 'Entrata' }} <small>· {{ dataBreve(item.dueDate) }}</small></span>
          <strong class="positivo">+{{ formattaEuro(item.amount) }}</strong>
        </li>
      </ul>
      <p class="testo">
        <strong>Non li contiamo</strong> in «Puoi spendere» finché non arrivano sul conto. Se un pagamento ritarda o non arriva, il numero in alto resta giusto e non rischi di spendere soldi che non hai.
        Quando l’entrata arriva, il numero sale da solo.
      </p>
    </template>
    <p v-else class="testo testo--tenue">
      Non hai entrate previste nei prossimi 30 giorni. Se hai uno stipendio o una pensione, aggiungili fra le
      <RouterLink to="/funzionalita/situazione/programmate">spese e entrate programmate</RouterLink>:
      così vedi quando arrivano.
    </p>
  </WCard>

  <WCard v-if="consiglio && stato.tono !== 'bene'" class="blocco">
    <h2>Cosa puoi fare</h2>
    <p class="testo">{{ consiglio.reason }}</p>
    <p class="testo testo--tenue">{{ consiglio.effect }}</p>
    <WButton v-if="consiglio.action" variant="secondary" @click="emit('suggerimento', consiglio)">{{ consiglio.title }}</WButton>
  </WCard>

  <WCard class="blocco">
    <h2 id="simulatore-title">Posso permettermi questa spesa?</h2>
    <label for="simulatore-importo" class="testo testo--tenue">Scrivi quanto costa e premi «Verifica». Non registriamo nessuna spesa.</label>
    <div class="domanda">
      <input
        id="simulatore-importo" v-model="importo" inputmode="decimal" placeholder="50 €"
        :aria-invalid="errore" @keydown.enter="verifica"
      >
      <WButton variant="primary" :disabled="!simulabile" :loading="purchaseSimulationState === 'loading'" @click="verifica">Verifica</WButton>
    </div>
    <p v-if="errore" class="errore" role="alert">Scrivi un importo, per esempio 50 oppure 12,50.</p>
    <p v-else-if="!simulabile" class="testo testo--tenue">Potrai usarlo quando WALLT saprà quanto puoi spendere.</p>
    <p v-if="purchaseSimulationState === 'error'" class="errore" role="alert">Non siamo riusciti a rispondere. Riprova.</p>
    <div v-if="risposta" class="risposta" aria-live="polite">
      <StatoRiga :tono="risposta.tono" :testo="`${risposta.titolo}. ${risposta.testo}`" />
    </div>
  </WCard>
</template>

<style scoped>
.oggi { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
.etichetta { margin: 0; color: var(--text-secondary); font-size: var(--text-base); }
.numero { display: block; margin: .15rem 0; color: var(--text-primary); font-size: 3rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sotto { margin: 0; color: var(--text-primary); font-size: var(--text-lg); line-height: 1.5; }
.spiega { margin: .6rem 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.55; }
.blocco { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1rem; }
h2 { margin: 0; color: var(--text-primary); font-size: 1.2rem; }
.testo { margin: 0; color: var(--text-primary); font-size: var(--text-base); line-height: 1.55; }
.testo--tenue { color: var(--text-secondary); font-size: var(--text-sm); }
.righe { margin: 0; padding: 0; list-style: none; }
.righe li { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--divider); font-size: var(--text-base); color: var(--text-primary); }
.righe li:last-child { border-bottom: 0; }
.righe small { color: var(--text-secondary); font-size: var(--text-sm); }
.righe strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.domanda { display: flex; gap: .6rem; }
.domanda input { flex: 1; min-width: 0; min-height: 48px; padding: .7rem .9rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-elevated); color: var(--text-primary); font: inherit; font-size: var(--text-lg); }
.conto { display: grid; gap: 0; margin: 0; font-size: var(--text-base); }
.conto__riga { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--divider); }
.conto__riga dt { margin: 0; color: var(--text-primary); }
.conto__riga dd { margin: 0; color: var(--text-primary); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.conto__riga--totale { border-bottom: 0; border-top: 2px solid var(--text-secondary); }
.conto__riga--totale dt, .conto__riga--totale dd { font-weight: 700; font-size: var(--text-lg); }
.conto__voci { margin: .35rem 0 0; padding-left: 1.1rem; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; }
.conto__nota { margin: .35rem 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.55; }
.conto__avviso { display: block; color: var(--warning); font-weight: 600; }
.conto__avviso a { color: inherit; }
.conto__nota-voce { display: block; }
.positivo { color: var(--positive); }
.testo a { color: var(--accent-text); }
.errore { margin: 0; color: var(--negative); font-size: var(--text-sm); }
</style>
