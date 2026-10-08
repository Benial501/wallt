<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WCard from '@/components/common/WCard.vue';
import WButton from '@/components/common/WButton.vue';
import WSkeleton from '@/components/common/WSkeleton.vue';
import { CheckCircle2, AlertTriangle, Landmark } from '@/utils/appIcons';
import { useBankSyncStore } from '@/stores/bankSync.store';
import { useToastStore } from '@/stores/toast.store';

/**
 * Il ritorno dalla banca.
 *
 * ── Perché il completamento è una POST autenticata e non una GET ─────────
 * La banca rimanda il browser qui con lo `state` nella query. Questa pagina
 * lo rimanda al server con il JWT della sessione, e il server verifica che
 * quello `state` appartenga PROPRIO a quell'utente. Un link costruito da un
 * sito terzo porterebbe lo `state` ma non la sessione, quindi non può
 * completare un collegamento: è la protezione contro il callback spoofing e
 * l'account linking attack.
 *
 * Non è nemmeno possibile fare altrimenti in questa architettura: il token
 * di WALLT vive in localStorage, non in un cookie, quindi una GET che il
 * browser segue verso l'API non porterebbe alcuna identità — e dedurre
 * l'utente da un parametro dell'URL è esattamente ciò che il brief vieta.
 *
 * ── Idempotenza ──────────────────────────────────────────────────────────
 * Ricaricare questa pagina ripresenta lo stesso `state`: il server riconosce
 * di averlo già consumato e restituisce la connessione esistente, senza
 * crearne una seconda. L'utente vede "collegato", non un errore.
 *
 * ── Limite noto (mobile) ─────────────────────────────────────────────────
 * Se la banca apre il ritorno in un browser diverso da quello in cui
 * l'utente è autenticato, la sessione non c'è e il router manda al login. Il
 * tentativo resta `in_attesa` e scade dopo 30 minuti, liberando il posto:
 * l'utente può ricominciare dalla pagina Conti senza restare bloccato.
 */
const route = useRoute();
const router = useRouter();
const bankSyncStore = useBankSyncStore();
const toastStore = useToastStore();

const stato = ref('in_corso');
const messaggio = ref('');

onMounted(async () => {
  // Un provider può ripetere un parametro nel redirect, e Vue Router in quel
  // caso consegna un array: prendere il primo valore evita che la pagina
  // fallisca per una forma della query invece che per un problema vero.
  const primo = (v) => (Array.isArray(v) ? v[0] : v);
  const state = primo(route.query.state);
  // Alcuni provider (Enable Banking) aggiungono un codice da scambiare con
  // una sessione. Con GoCardless è assente, e il server se ne accorge da sé.
  const code = primo(route.query.code) ?? null;

  if (typeof state !== 'string' || state.length < 20) {
    stato.value = 'errore';
    messaggio.value = 'Il link di ritorno dalla banca non è valido o è incompleto.';
    return;
  }

  try {
    await bankSyncStore.completaCollegamento(state, code);
    stato.value = 'ok';
    toastStore.success('Banca autorizzata');
    // Un attimo per far leggere l'esito, poi la pagina dove il conto vive.
    setTimeout(() => router.replace({ name: 'conti' }), 1600);
  } catch (err) {
    stato.value = 'errore';
    messaggio.value = err?.response?.data?.message
      || 'Non è stato possibile completare il collegamento. Puoi riprovare dalla pagina Conti.';
  }
});
</script>

<template>
  <div class="banca-callback animate-fade-in">
    <WCard class="banca-callback__card">
      <span class="banca-callback__icona" :class="`banca-callback__icona--${stato}`">
        <component
          :is="stato === 'ok' ? CheckCircle2 : (stato === 'errore' ? AlertTriangle : Landmark)"
          :size="28"
          :stroke-width="1.6"
          aria-hidden="true"
        />
      </span>

      <template v-if="stato === 'in_corso'">
        <h1 class="banca-callback__titolo">Stiamo collegando il tuo conto</h1>
        <p class="banca-callback__testo">
          Ci vuole qualche secondo. Non chiudere questa pagina.
        </p>
        <WSkeleton type="text" :lines="2" />
      </template>

      <template v-else-if="stato === 'ok'">
        <h1 class="banca-callback__titolo">Banca autorizzata</h1>
        <!-- Non si promette qui quanti giorni verranno importati: prima c'è la
             riconciliazione (a quale conto WALLT appartiene questa banca) e poi
             la soglia, che l'utente sceglie se ha già movimenti propri. -->
        <p class="banca-callback__testo">
          Ora scegli a quale conto WALLT associare questa banca: ti portiamo ai
          tuoi conti.
        </p>
      </template>

      <template v-else>
        <h1 class="banca-callback__titolo">Collegamento non completato</h1>
        <p class="banca-callback__testo">{{ messaggio }}</p>
        <p class="banca-callback__rassicura">
          Nessun dato è stato modificato: i tuoi conti e movimenti sono come
          li avevi lasciati.
        </p>
        <WButton variant="primary" size="md" @click="router.replace({ name: 'conti' })">
          Torna ai conti
        </WButton>
      </template>
    </WCard>
  </div>
</template>

<style scoped>
.banca-callback {
  display: flex;
  justify-content: center;
  padding: 2rem 0;
}

.banca-callback__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 32rem;
  text-align: center;
}

.banca-callback__icona {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
}

.banca-callback__icona--ok { color: var(--positive); }
.banca-callback__icona--errore { color: var(--warning); }

.banca-callback__titolo {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}

.banca-callback__testo {
  margin: 0;
  font-size: 0.9375rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.banca-callback__rassicura {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}
</style>
