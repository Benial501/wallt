<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';

const router = useRouter();
const authStore = useAuthStore();

const companyName = import.meta.env.VITE_COMPANY_NAME || 'WALLT';
const companyAddress = import.meta.env.VITE_COMPANY_ADDRESS || '[Indirizzo da configurare]';
const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@wallt.app';
const legalEmail = import.meta.env.VITE_LEGAL_EMAIL || 'legal@wallt.app';

const lastUpdated = '14 luglio 2026';

const definitions = [
  {
    term: 'Servizio',
    description: 'L\'applicazione web WALLT e tutte le funzionalità ad essa collegate (gestione conti, movimenti, budget, analisi, import estratti e moduli opzionali).',
  },
  {
    term: 'Utente',
    description: 'Qualsiasi persona fisica che accede al Servizio, si registra o utilizza le funzionalità di WALLT.',
  },
  {
    term: 'Account',
    description: 'L\'area personale dell\'Utente, accessibile mediante credenziali o autenticazione OAuth, contenente i dati e le impostazioni associate.',
  },
];

const prohibitedUses = [
  'Utilizzare il Servizio per scopi illeciti o fraudolenti.',
  'Tentare di accedere ad account altrui o bypassare misure di sicurezza.',
  'Eseguire reverse engineering, decompilazione o estrazione del codice sorgente, salvo quanto consentito dalla legge.',
  'Sovraccaricare intenzionalmente l\'infrastruttura (attacchi DDoS, scraping massivo, bot non autorizzati).',
  'Caricare malware o contenuti che violino diritti di terzi.',
  'Rivendere, sublicenziare o mettere a disposizione il Servizio a terzi senza autorizzazione scritta.',
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
          Termini e Condizioni d'uso
        </h1>
        <p class="text-[var(--text-secondary)] leading-relaxed">
          I presenti Termini regolano l'accesso e l'utilizzo del Servizio WALLT offerto da
          {{ companyName }}. Utilizzando WALLT, l'Utente accetta integralmente quanto segue.
        </p>
      </div>

      <article class="space-y-10">
        <!-- 1. Definizioni -->
        <section class="legal-section">
          <h2>1. Definizioni</h2>
          <p class="section-lead">
            Ai fini dei presenti Termini, si intende per:
          </p>
          <div class="space-y-3">
            <div
              v-for="item in definitions"
              :key="item.term"
              class="legal-card"
            >
              <h3 class="text-sm font-semibold text-[var(--accent-green)] mb-1">
                {{ item.term }}
              </h3>
              <p class="text-sm text-[var(--text-secondary)]">
                {{ item.description }}
              </p>
            </div>
          </div>
        </section>

        <!-- 2. Descrizione servizio -->
        <section class="legal-section">
          <h2>2. Descrizione del Servizio</h2>
          <div class="legal-card space-y-3">
            <p class="text-[var(--text-secondary)]">
              WALLT è uno <strong class="text-[var(--text-primary)]">strumento di gestione finanziaria personale</strong>
              che consente di registrare movimenti, monitorare budget, visualizzare analisi e organizzare
              le proprie finanze in modo autonomo.
            </p>
            <div class="notice-box">
              <p>
                WALLT <strong>non costituisce consulenza finanziaria, fiscale o legale</strong>.
                Le informazioni, i grafici, le categorizzazioni automatiche e i suggerimenti di budget
                hanno finalità esclusivamente informative e organizzative.
              </p>
            </div>
            <p class="text-[var(--text-secondary)]">
              {{ companyName }} <strong class="text-[var(--text-primary)]">non garantisce</strong>
              alcun risparmio, rendimento, risultato economico o accuratezza assoluta dei dati elaborati.
              L'Utente resta l'unico responsabile delle proprie decisioni finanziarie.
            </p>
          </div>
        </section>

        <!-- 3. Requisiti utente -->
        <section class="legal-section">
          <h2>3. Requisiti dell'Utente</h2>
          <ul class="legal-list">
            <li>
              L'Utente deve avere almeno <strong>7 anni</strong> per registrarsi e utilizzare WALLT.
            </li>
            <li>
              Alcune funzionalità del Servizio sono riservate ai <strong>maggiorenni (18 anni compiuti)</strong>,
              come le sezioni dedicate a scommesse e investimenti. Per accedervi, l'Utente deve avere almeno
              18 anni o l'età minima prevista dalla legge applicabile nel proprio Paese di residenza.
            </li>
            <li>
              L'Utente dichiara di fornire <strong>dati veritieri, completi e aggiornati</strong>
              in fase di registrazione e durante l'utilizzo del Servizio.
            </li>
            <li>
              L'Utente garantisce di utilizzare WALLT esclusivamente per la gestione delle proprie
              finanze personali o, ove consentito, di enti per i quali è legittimato ad operare.
            </li>
          </ul>
        </section>

        <!-- 4. Registrazione e sicurezza -->
        <section class="legal-section">
          <h2>4. Registrazione e sicurezza</h2>
          <div class="legal-card space-y-3">
            <p class="text-[var(--text-secondary)]">
              Per accedere al Servizio è necessario creare un Account mediante registrazione email/password
              o autenticazione con provider terzi (es. Google OAuth), ove disponibile.
            </p>
            <p class="text-[var(--text-secondary)]">
              L'Utente è responsabile della <strong class="text-[var(--text-primary)]">riservatezza
              delle proprie credenziali</strong> e di ogni attività svolta tramite il proprio Account.
              È obbligo segnalare tempestivamente a {{ companyName }} qualsiasi accesso non autorizzato
              o sospetta compromissione dell'Account.
            </p>
            <p class="text-sm text-[var(--text-muted)]">
              {{ companyName }} adotta misure tecniche e organizzative adeguate per proteggere il Servizio,
              senza tuttavia poter garantire sicurezza assoluta su Internet.
            </p>
          </div>
        </section>

        <!-- 5. Utilizzo corretto -->
        <section class="legal-section">
          <h2>5. Utilizzo corretto del Servizio</h2>
          <p class="section-lead">
            L'Utente si impegna a utilizzare WALLT in conformità alla legge e ai presenti Termini.
            È vietato, a titolo esemplificativo:
          </p>
          <ul class="legal-list">
            <li
              v-for="(rule, index) in prohibitedUses"
              :key="index"
            >
              {{ rule }}
            </li>
          </ul>
          <p class="mt-4 text-sm text-[var(--text-muted)]">
            {{ companyName }} si riserva il diritto di sospendere o chiudere Account che violino
            le presenti disposizioni, fatti salvi i rimedi di legge.
          </p>
        </section>

        <!-- 6. Proprietà intellettuale -->
        <section class="legal-section">
          <h2>6. Proprietà intellettuale</h2>
          <div class="legal-card space-y-3">
            <p class="text-[var(--text-secondary)]">
              Il Servizio, inclusi marchio WALLT, interfaccia grafica, codice software, testi, loghi,
              algoritmi e documentazione, è di proprietà di {{ companyName }} o dei rispettivi licenzianti
              ed è protetto dalle norme applicabili in materia di proprietà intellettuale.
            </p>
            <p class="text-[var(--text-secondary)]">
              All'Utente è concessa una licenza <strong class="text-[var(--text-primary)]">limitata,
              non esclusiva, non trasferibile e revocabile</strong> per l'uso personale del Servizio
              nel rispetto dei presenti Termini.
            </p>
            <p class="text-[var(--text-secondary)]">
              I dati finanziari inseriti dall'Utente restano di proprietà dell'Utente.
              {{ companyName }} tratta tali dati esclusivamente per erogare il Servizio,
              come descritto nell'
              <router-link
                to="/privacy"
                class="text-[var(--accent-green)] hover:underline"
              >
                Informativa sulla Privacy
              </router-link>.
            </p>
          </div>
        </section>

        <!-- 7. Limitazione responsabilità -->
        <section class="legal-section">
          <h2>7. Limitazione di responsabilità</h2>
          <div class="legal-card space-y-3">
            <div class="notice-box">
              <p>
                WALLT non è responsabile per le decisioni finanziarie dell'Utente,
                né per perdite economiche, mancati guadagni o danni indiretti derivanti
                dall'uso o dall'impossibilità di usare il Servizio.
              </p>
            </div>
            <p class="text-[var(--text-secondary)]">
              Il Servizio è fornito <strong class="text-[var(--text-primary)]">"così com'è"</strong>
              e "come disponibile", nei limiti consentiti dalla legge applicabile.
            </p>
            <p class="text-[var(--text-secondary)]">
              {{ companyName }} non garantisce che il Servizio sia privo di errori, interruzioni
              o imprecisioni (inclusa la categorizzazione automatica delle transazioni).
              L'Utente è tenuto a verificare i propri dati prima di prendere decisioni rilevanti.
            </p>
            <p class="text-sm text-[var(--text-muted)]">
              Nulla nei presenti Termini esclude o limita responsabilità che non possano essere
              escluse o limitate ai sensi della legge italiana (inclusi casi di dolo o colpa grave).
            </p>
          </div>
        </section>

        <!-- 8. Modifiche termini -->
        <section class="legal-section">
          <h2>8. Modifiche ai Termini</h2>
          <div class="legal-card space-y-3">
            <p class="text-[var(--text-secondary)]">
              {{ companyName }} può aggiornare i presenti Termini per adeguamenti normativi,
              evoluzioni del Servizio o esigenze di sicurezza.
            </p>
            <p class="text-[var(--text-secondary)]">
              Le modifiche saranno pubblicate su questa pagina con indicazione della data
              di ultimo aggiornamento. Per cambiamenti sostanziali, l'Utente potrà essere
              informato via email o mediante avviso in-app.
            </p>
            <p class="text-[var(--text-secondary)]">
              L'uso continuato del Servizio dopo l'entrata in vigore delle modifiche
              costituisce accettazione dei Termini aggiornati. In caso di disaccordo,
              l'Utente può cessare l'utilizzo e richiedere la cancellazione dell'Account.
            </p>
          </div>
        </section>

        <!-- 9. Legge applicabile -->
        <section class="legal-section">
          <h2>9. Legge applicabile e foro competente</h2>
          <div class="legal-card space-y-3">
            <p class="text-[var(--text-secondary)]">
              I presenti Termini sono regolati dalla <strong class="text-[var(--text-primary)]">legge italiana</strong>.
            </p>
            <p class="text-[var(--text-secondary)]">
              Per le controversie derivanti dai presenti Termini o dall'utilizzo del Servizio,
              sarà competente in via esclusiva il Foro del domicilio o della residenza dell'Utente
              consumatore, se ubicati nel territorio italiano, salvo diversa disposizione inderogabile
              di legge.
            </p>
            <p class="text-sm text-[var(--text-muted)]">
              Ai sensi del Regolamento UE n. 524/2013, l'Utente consumatore può ricorrere
              alla piattaforma ODR europea per la risoluzione extragiudiziale delle controversie:
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--accent-green)] hover:underline"
              >ec.europa.eu/consumers/odr</a>.
            </p>
          </div>
        </section>

        <!-- 10. Contatti -->
        <section class="legal-section">
          <h2>10. Contatti</h2>
          <div class="legal-card">
            <p class="text-[var(--text-secondary)]">
              Per domande sui presenti Termini o segnalazioni relative al Servizio:
            </p>
            <ul class="mt-4 space-y-2">
              <li>
                <span class="text-[var(--text-muted)]">Titolare:</span>
                <span class="ml-2 text-[var(--text-primary)]">{{ companyName }}</span>
              </li>
              <li>
                <span class="text-[var(--text-muted)]">Sede:</span>
                <span class="ml-2 text-[var(--text-secondary)]">{{ companyAddress }}</span>
              </li>
              <li>
                <span class="text-[var(--text-muted)]">Supporto:</span>
                <a
                  :href="`mailto:${supportEmail}`"
                  class="ml-2 text-[var(--accent-green)] hover:underline"
                >{{ supportEmail }}</a>
              </li>
              <li>
                <span class="text-[var(--text-muted)]">Questioni legali:</span>
                <a
                  :href="`mailto:${legalEmail}`"
                  class="ml-2 text-[var(--accent-green)] hover:underline"
                >{{ legalEmail }}</a>
              </li>
            </ul>
          </div>
        </section>
      </article>

      <footer class="mt-12 pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-center gap-3">
        <router-link
          to="/privacy"
          class="text-sm text-[var(--text-muted)] hover:text-[var(--accent-green)] hover:underline"
        >
          Informativa sulla Privacy
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
.legal-section h2 {
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

.legal-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  line-height: 1.625;
}

.notice-box {
  padding: 1rem 1.125rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(0, 212, 170, 0.25);
  background: var(--accent-light);
  color: var(--text-secondary);
  font-size: 0.9375rem;
  line-height: 1.625;
}

.notice-box strong {
  color: var(--text-primary);
}

.legal-list {
  list-style: disc;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  line-height: 1.625;
}

.legal-list li {
  margin-bottom: 0.5rem;
}

.legal-list strong {
  color: var(--text-primary);
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
