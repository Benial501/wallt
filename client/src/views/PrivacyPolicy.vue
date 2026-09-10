<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const router = useRouter();
const authStore = useAuthStore();

const companyName = import.meta.env.VITE_COMPANY_NAME || 'WALLT';
const companyAddress = import.meta.env.VITE_COMPANY_ADDRESS || '[Indirizzo da configurare]';
const companyEmail = import.meta.env.VITE_COMPANY_EMAIL || 'support@pec.wallt.it';
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@pec.wallt.it';

const lastUpdated = '14 luglio 2026';

const dataCollected = [
  { category: 'Identità', items: 'Nome, indirizzo email, avatar (opzionale)' },
  { category: 'Autenticazione', items: 'Password (hash bcrypt, mai in chiaro), provider OAuth (Google), identificativo Google' },
  { category: 'Profilo finanziario', items: 'Reddito, spese fisse, situazione abitativa e lavorativa (onboarding)' },
  { category: 'Dati finanziari', items: 'Conti, saldi, movimenti, categorie, budget, obiettivi' },
  { category: 'Moduli opzionali', items: 'Investimenti, scommesse (se abilitati dall\'utente)' },
  { category: 'Preferenze', items: 'Valuta, tema, reminder, visibilità sezioni, consenso categorizzazione AI' },
  { category: 'Consensi legali', items: 'Data accettazione Privacy Policy e Termini d\'uso' },
  { category: 'Dati tecnici', items: 'Token di sessione (JWT nel browser), log di sistema anonimizzati' },
];

const thirdPartyServices = [
  {
    name: 'Google OAuth',
    purpose: 'Autenticazione con account Google',
    data: 'Nome, email, foto profilo, ID Google',
    legal: 'Contratto / consenso al login social',
  },
  {
    name: 'OpenAI',
    purpose: 'Categorizzazione automatica delle transazioni',
    data: 'Tipo, importo e descrizione movimento (solo se l\'utente ha attivato la funzione)',
    legal: 'Consenso esplicito (opt-in)',
  },
  {
    name: 'Hosting provider (VPS UE)',
    purpose: 'Erogazione del servizio e conservazione dati',
    data: 'Tutti i dati dell\'account, su server nell\'Unione Europea',
    legal: 'Contratto (sub-responsabile del trattamento)',
  },
];

const gdprRights = [
  { right: 'Accesso', description: 'Ottenere conferma e copia dei tuoi dati personali.' },
  { right: 'Rettifica', description: 'Correggere dati inesatti o incompleti dal profilo e dalle impostazioni.' },
  { right: 'Cancellazione', description: 'Eliminare l\'account e tutti i dati associati (diritto all\'oblio).' },
  { right: 'Portabilità', description: 'Esportare i tuoi dati in formato JSON dalle Impostazioni.' },
  { right: 'Limitazione', description: 'Richiedere la limitazione del trattamento in casi previsti dal GDPR.' },
  { right: 'Opposizione', description: 'Opporti al trattamento basato su interesse legittimo, ove applicabile.' },
];

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push(authStore.isAuthenticated ? '/dashboard' : '/login');
};

const backLabel = computed(() => (
  authStore.isAuthenticated ? 'Torna all\'app' : 'Torna al login'
));
</script>

<template>
  <div class="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <header class="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <router-link
          to="/"
          class="flex items-center gap-2 shrink-0"
        >
          <img src="/brand/wallt-app-icon-96.png" alt="WALLT" class="w-9 h-9 rounded-xl" width="96" height="96">
          <span class="font-bold tracking-tight hidden sm:inline">
            WALL<span class="text-[var(--accent-green)]">T</span>
          </span>
        </router-link>

        <button
          type="button"
          class="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-green)] transition-colors"
          @click="goBack"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {{ backLabel }}
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-16">
      <div class="mb-10">
        <p class="text-sm text-[var(--text-muted)] mb-2">
          Ultimo aggiornamento: {{ lastUpdated }}
        </p>
        <h1 class="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          Informativa sulla Privacy
        </h1>
        <p class="text-[var(--text-secondary)] leading-relaxed">
          La presente informativa descrive come {{ companyName }} tratta i dati personali
          degli utenti dell'applicazione WALLT, in conformità al Regolamento (UE) 2016/679 (GDPR).
        </p>
      </div>

      <article class="space-y-10">
        <!-- 1. Titolare -->
        <section class="privacy-section">
          <h2>1. Titolare del trattamento</h2>
          <div class="privacy-card">
            <p><strong>{{ companyName }}</strong></p>
            <p class="mt-2 text-[var(--text-secondary)]">{{ companyAddress }}</p>
            <p class="mt-2">
              Email:
              <a
                :href="`mailto:${companyEmail}`"
                class="text-[var(--accent-green)] hover:underline"
              >{{ companyEmail }}</a>
            </p>
          </div>
        </section>

        <!-- 2. Dati raccolti -->
        <section class="privacy-section">
          <h2>2. Dati raccolti</h2>
          <p class="section-lead">
            Raccogliamo solo i dati necessari per erogare il servizio di gestione finanziaria personale.
          </p>
          <div class="overflow-x-auto -mx-1">
            <table class="privacy-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Dati</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in dataCollected"
                  :key="row.category"
                >
                  <td>{{ row.category }}</td>
                  <td>{{ row.items }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-4 text-sm text-[var(--text-muted)]">
            Le descrizioni delle transazioni possono contenere riferimenti a esercenti o beneficiari:
            ti invitiamo a evitare di inserire dati superflui di terzi.
          </p>
        </section>

        <!-- 3. Finalità -->
        <section class="privacy-section">
          <h2>3. Finalità del trattamento</h2>
          <ul class="privacy-list">
            <li><strong>Gestione account:</strong> registrazione, autenticazione, profilo utente.</li>
            <li><strong>Gestione finanziaria:</strong> conti, movimenti, budget, obiettivi e analisi.</li>
            <li><strong>Import estratti:</strong> elaborazione file caricati dall'utente (CSV, Excel).</li>
            <li><strong>Categorizzazione:</strong> assegnazione automatica categorie e regole merchant personali.</li>
            <li><strong>Notifiche e reminder:</strong> promemoria configurabili dall'utente.</li>
            <li><strong>Sicurezza:</strong> prevenzione abusi, rate limiting, audit operativi.</li>
            <li><strong>Obblighi legali:</strong> adempimenti fiscali e contabili ove applicabili.</li>
          </ul>
        </section>

        <!-- 4. Base giuridica -->
        <section class="privacy-section">
          <h2>4. Base giuridica</h2>
          <ul class="privacy-list">
            <li>
              <strong>Consenso (art. 6.1.a GDPR):</strong>
              accettazione della presente informativa, Termini d'uso e, separatamente,
              attivazione della categorizzazione tramite AI.
            </li>
            <li>
              <strong>Esecuzione del contratto (art. 6.1.b GDPR):</strong>
              erogazione del servizio WALLT richiesto dall'utente.
            </li>
            <li>
              <strong>Obblighi legali (art. 6.1.c GDPR):</strong>
              conservazione documenti contabili/fiscali per i termini di legge.
            </li>
            <li>
              <strong>Interesse legittimo (art. 6.1.f GDPR):</strong>
              sicurezza della piattaforma, prevenzione frodi e miglioramento del servizio,
              nel rispetto dei diritti dell'interessato.
            </li>
          </ul>
        </section>

        <!-- 5. Conservazione -->
        <section class="privacy-section">
          <h2>5. Conservazione dei dati</h2>
          <div class="privacy-card space-y-3">
            <p>
              I dati dell'account vengono conservati finché l'account è attivo.
              Alla cancellazione dell'account, i dati personali vengono eliminati
              entro <strong>30 giorni</strong>, salvo quanto necessario per obblighi di legge.
            </p>
            <p>
              Per adempimenti fiscali e contabili, alcune informazioni aggregate o documentali
              possono essere conservate fino a <strong>12 mesi</strong> dalla cancellazione,
              o per il periodo previsto dalla normativa applicabile.
            </p>
            <p class="text-sm text-[var(--text-muted)]">
              I token di reset password scadono automaticamente e vengono invalidati dopo l'uso.
            </p>
          </div>
        </section>

        <!-- 6. Servizi terzi -->
        <section class="privacy-section">
          <h2>6. Servizi terzi e sub-responsabili</h2>
          <p class="section-lead">
            Per erogare alcune funzionalità ci avvaliamo di fornitori esterni,
            con contratti che garantiscono adeguate misure di protezione dei dati.
          </p>
          <div class="space-y-4">
            <div
              v-for="service in thirdPartyServices"
              :key="service.name"
              class="privacy-card"
            >
              <h3 class="text-base font-semibold text-[var(--text-primary)] mb-2">
                {{ service.name }}
              </h3>
              <dl class="space-y-1.5 text-sm">
                <div class="flex flex-col sm:flex-row sm:gap-2">
                  <dt class="text-[var(--text-muted)] shrink-0 sm:w-28">Finalità</dt>
                  <dd class="text-[var(--text-secondary)]">{{ service.purpose }}</dd>
                </div>
                <div class="flex flex-col sm:flex-row sm:gap-2">
                  <dt class="text-[var(--text-muted)] shrink-0 sm:w-28">Dati trattati</dt>
                  <dd class="text-[var(--text-secondary)]">{{ service.data }}</dd>
                </div>
                <div class="flex flex-col sm:flex-row sm:gap-2">
                  <dt class="text-[var(--text-muted)] shrink-0 sm:w-28">Base giuridica</dt>
                  <dd class="text-[var(--text-secondary)]">{{ service.legal }}</dd>
                </div>
              </dl>
            </div>
          </div>
          <p class="mt-4 text-sm text-[var(--text-muted)]">
            OpenAI non riceve dati se non hai attivato esplicitamente la categorizzazione AI
            nelle impostazioni del tuo account.
          </p>
        </section>

        <!-- 7. Diritti GDPR -->
        <section class="privacy-section">
          <h2>7. Diritti dell'interessato</h2>
          <p class="section-lead">
            In qualità di interessato, puoi esercitare in qualsiasi momento i seguenti diritti
            previsti dagli artt. 15–22 del GDPR:
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="item in gdprRights"
              :key="item.right"
              class="privacy-card"
            >
              <h3 class="text-sm font-semibold text-[var(--accent-green)] mb-1">
                {{ item.right }}
              </h3>
              <p class="text-sm text-[var(--text-secondary)]">
                {{ item.description }}
              </p>
            </div>
          </div>
          <p class="mt-4 text-sm text-[var(--text-secondary)]">
            Per richieste relative ai diritti GDPR, scrivi a
            <a
              :href="`mailto:${companyEmail}`"
              class="text-[var(--accent-green)] hover:underline"
            >{{ companyEmail }}</a>.
            Hai inoltre diritto di proporre reclamo all'Autorità Garante per la Protezione
            dei Dati Personali (<a
              href="https://www.garanteprivacy.it"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[var(--accent-green)] hover:underline"
            >garanteprivacy.it</a>).
          </p>
        </section>

        <!-- 8. Cancellazione account -->
        <section class="privacy-section">
          <h2>8. Cancellazione dell'account</h2>
          <div class="privacy-card space-y-3">
            <p>Puoi eliminare definitivamente il tuo account da:</p>
            <p class="font-medium text-[var(--accent-green)]">
              Impostazioni → Zona pericolosa → Elimina account
            </p>
            <p class="text-[var(--text-secondary)]">
              La cancellazione comporta l'eliminazione di conti, movimenti, budget, obiettivi,
              regole di categorizzazione, profilo e preferenze. L'operazione è irreversibile.
            </p>
            <p class="text-[var(--text-secondary)]">
              Per gli account con password locale è richiesta la conferma con password;
              per gli account Google, la digitazione della parola <strong>ELIMINA</strong>.
            </p>
            <p class="text-sm text-[var(--text-muted)]">
              Tempistiche: i dati vengono rimossi dal sistema operativo entro 30 giorni.
              Backup incrementali possono conservare copie cifrate fino al ciclo di rotazione
              successivo (massimo 30 giorni).
            </p>
          </div>
        </section>

        <!-- 9. Contatti -->
        <section class="privacy-section">
          <h2>9. Contatti</h2>
          <div class="privacy-card">
            <p class="text-[var(--text-secondary)]">
              Per domande su questa informativa, sul trattamento dei dati o per assistenza:
            </p>
            <ul class="mt-4 space-y-2">
              <li>
                <span class="text-[var(--text-muted)]">Privacy:</span>
                <a
                  :href="`mailto:${companyEmail}`"
                  class="ml-2 text-[var(--accent-green)] hover:underline"
                >{{ companyEmail }}</a>
              </li>
              <li>
                <span class="text-[var(--text-muted)]">Supporto:</span>
                <a
                  :href="`mailto:${supportEmail}`"
                  class="ml-2 text-[var(--accent-green)] hover:underline"
                >{{ supportEmail }}</a>
              </li>
            </ul>
          </div>
        </section>
      </article>

      <footer class="mt-12 pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-center gap-3">
        <router-link
          to="/termini"
          class="text-sm text-[var(--text-muted)] hover:text-[var(--accent-green)] hover:underline"
        >
          Termini di utilizzo
        </router-link>
        <button
          type="button"
          class="wallt-btn-secondary text-sm"
          @click="goBack"
        >
          {{ backLabel }}
        </button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.privacy-section h2 {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.section-lead {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  line-height: 1.625;
}

.privacy-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  line-height: 1.625;
}

.privacy-list {
  list-style: disc;
  padding-left: 1.25rem;
  space-y: 0.5rem;
  color: var(--text-secondary);
  line-height: 1.625;
}

.privacy-list li {
  margin-bottom: 0.5rem;
}

.privacy-list strong {
  color: var(--text-primary);
}

.privacy-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.privacy-table th,
.privacy-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border: 1px solid var(--border);
  vertical-align: top;
}

.privacy-table th {
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
}

.privacy-table td {
  color: var(--text-secondary);
}

.privacy-table tbody tr:nth-child(even) td {
  background: var(--bg-secondary);
}

.privacy-table tbody tr:nth-child(odd) td {
  background: var(--bg-card);
}

.wallt-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s;
}

.wallt-btn-secondary:hover {
  background: var(--bg-card-hover);
  border-color: var(--accent-green);
}
</style>
