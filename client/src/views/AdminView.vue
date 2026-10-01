<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/it';
import WCard from '@/components/common/WCard.vue';
import AppDialog from '@/components/common/AppDialog.vue';
import WButton from '@/components/common/WButton.vue';
import DataState from '@/components/common/DataState.vue';
import { Shield, Search, RefreshCw } from '@/utils/appIcons';
import { useAdminStore } from '@/stores/admin.store';
import { useToastStore } from '@/stores/toast.store';
import {
  FEATURE_BANK_SYNC, SOURCE_ETICHETTE, RICHIESTA_ETICHETTE,
  RICHIESTA_PENDING, RICHIESTA_APPROVED, RICHIESTA_REJECTED,
  RICHIESTA_AUTO_APPROVED_BETA,
} from '@/utils/entitlements';

dayjs.locale('it');

/**
 * `/admin` — amministrazione della beta e di Bank Sync.
 *
 * ── Qui non c'è nessun controllo di sicurezza ────────────────────────────
 * E non deve esserci: l'autorizzazione vive nel server, che risponde 404 a
 * chi non è amministratore. Nascondere la voce di menu è una comodità, non
 * una protezione. Chi forzasse questo indirizzo vedrebbe una pagina che non
 * riesce a caricare nulla.
 *
 * ── Cosa NON si vede ─────────────────────────────────────────────────────
 * Nessun movimento, nessun saldo, nessuna descrizione di transazione,
 * nessun IBAN. I dati finanziari di una persona non sono dati di
 * amministrazione: qui si vede chi ha accesso, da dove viene quell'accesso,
 * e se la sua connessione funziona.
 *
 * ── Ogni azione è auditata ───────────────────────────────────────────────
 * Lo fa il server. Il registro in fondo alla pagina è la stessa traccia,
 * letta: serve a rispondere a "chi ha dato Bank Sync a questa persona, e
 * quando?".
 */
const adminStore = useAdminStore();
const toastStore = useToastStore();

const ricerca = ref('');
const soloBankSync = ref(false);
const inCorso = ref(null);

const filtri = computed(() => ({
  ...(ricerca.value.trim() ? { q: ricerca.value.trim() } : {}),
  ...(soloBankSync.value ? { solo_bank_sync: true } : {}),
  limite: 50,
}));

/**
 * I filtri della coda richieste. `null` = tutte, compresi gli stati che non
 * hanno una scheda propria (annullate): nasconderle del tutto farebbe
 * sparire righe senza che nessun filtro lo spieghi.
 */
const FILTRI_RICHIESTE = [
  { chiave: 'tutte', etichetta: 'Tutte', stato: null },
  { chiave: RICHIESTA_PENDING, etichetta: 'In attesa', stato: RICHIESTA_PENDING },
  { chiave: RICHIESTA_APPROVED, etichetta: 'Approvate', stato: RICHIESTA_APPROVED },
  { chiave: RICHIESTA_REJECTED, etichetta: 'Rifiutate', stato: RICHIESTA_REJECTED },
  { chiave: RICHIESTA_AUTO_APPROVED_BETA, etichetta: 'Beta', stato: RICHIESTA_AUTO_APPROVED_BETA },
];

const filtroRichieste = ref('tutte');

const filtriRichieste = computed(() => {
  const scelto = FILTRI_RICHIESTE.find((f) => f.chiave === filtroRichieste.value);
  return scelto?.stato ? { stato: scelto.stato } : {};
});

onMounted(() => {
  adminStore.risorsaRiepilogo.carica();
  adminStore.risorsaUtenti.carica(filtri.value);
  adminStore.risorsaRichieste.carica(filtriRichieste.value);
  adminStore.risorsaConfig.carica();
  adminStore.risorsaAudit.carica({ limite: 30 });
});

const filtraRichieste = (chiave) => {
  filtroRichieste.value = chiave;
  adminStore.risorsaRichieste.carica(filtriRichieste.value);
};

const cerca = () => adminStore.risorsaUtenti.carica(filtri.value);

// I dati arrivano dai getter dello store: attraverso il proxy Pinia i ref
// annidati sono già scompattati, quindi `risorsa.data.value` da qui sarebbe
// `undefined`. È la stessa trappola che Coding Rule 20 descrive al contrario.
const riepilogo = computed(() => adminStore.riepilogo);
const utenti = computed(() => adminStore.utenti);
const configurazione = computed(() => adminStore.configurazione);
const audit = computed(() => adminStore.audit);
const richieste = computed(() => adminStore.richieste);
const contatori = computed(() => adminStore.contatoriRichieste);

const quando = (valore) => (valore ? dayjs(valore).format('D MMM YYYY, HH:mm') : '—');

const esegui = async (chiave, azione, messaggioOk) => {
  inCorso.value = chiave;
  try {
    await azione();
    toastStore.success(messaggioOk);
  } catch (err) {
    toastStore.error(err?.response?.data?.message || 'Operazione non riuscita');
  } finally {
    inCorso.value = null;
  }
};

const concedi = (utente) => esegui(
  `grant-${utente.id}`,
  () => adminStore.concedi({ userId: utente.id, featureKey: FEATURE_BANK_SYNC }),
  `Bank Sync concesso a ${utente.email}`,
);

const revoca = (utente) => esegui(
  `revoke-${utente.id}`,
  () => adminStore.revoca({ userId: utente.id, featureKey: FEATURE_BANK_SYNC }),
  `Bank Sync revocato a ${utente.email}. I movimenti già importati restano.`,
);

const scollega = (utente) => esegui(
  `unlink-${utente.id}`,
  () => adminStore.scollegaBanca(utente.id),
  `Banca scollegata per ${utente.email}. I movimenti restano.`,
);

const cambia = (voce, valore) => esegui(
  `config-${voce.chiave}`,
  () => adminStore.salvaConfig(voce.chiave, valore),
  `${voce.chiave} aggiornata`,
);

/**
 * La decisione passa da una conferma esplicita con motivo facoltativo.
 *
 * Non è cerimonia: approvare concede un diritto a una persona reale e
 * rifiutare resta per sempre nello storico. Un click diretto in tabella
 * rende troppo facile farlo sulla riga sbagliata, e nessuna delle due
 * azioni ha un "annulla".
 */
const decisione = ref(null);
const motivo = ref('');

const apriDecisione = (richiesta, tipo) => {
  decisione.value = { richiesta, tipo };
  motivo.value = '';
};

const confermaDecisione = async () => {
  if (!decisione.value) return;
  const { richiesta, tipo } = decisione.value;
  const approva = tipo === 'approva';
  await esegui(
    `${tipo}-${richiesta.id}`,
    () => (approva ? adminStore.approvaRichiesta : adminStore.rifiutaRichiesta)({
      id: richiesta.id,
      motivo: motivo.value.trim() || null,
    }),
    approva
      ? `Bank Sync concesso a ${richiesta.email}. Nessun posto beta consumato.`
      : `Richiesta di ${richiesta.email} rifiutata. Gli eventuali diritti restano invariati.`,
  );
  decisione.value = null;
  motivo.value = '';
};

const statoEtichetta = (stato) => RICHIESTA_ETICHETTE[stato] ?? stato;

/** Solo una richiesta non ancora accolta si può approvare; solo una non
 * ancora rifiutata si può rifiutare. Il server rifiuta comunque con 409: qui
 * si evita soltanto di offrire un pulsante che non farebbe nulla. */
const puoApprovare = (r) => ![RICHIESTA_APPROVED, RICHIESTA_AUTO_APPROVED_BETA].includes(r.status);
const puoRifiutare = (r) => r.status !== RICHIESTA_REJECTED;

const origineEtichetta = (source) => SOURCE_ETICHETTE[source] ?? source;
</script>

<template>
  <div class="admin animate-fade-in">
    <header class="page-header">
      <div>
        <div class="page-title-row">
          <Shield :size="22" :stroke-width="1.75" aria-hidden="true" />
          <h1 class="page-title">Amministrazione</h1>
        </div>
        <p class="page-sub">Beta, permessi e connessioni bancarie</p>
      </div>
      <WButton variant="secondary" size="sm" @click="adminStore.ricarica(filtri, filtriRichieste)">
        <RefreshCw :size="15" :stroke-width="1.75" aria-hidden="true" />
        Aggiorna
      </WButton>
    </header>

    <!-- ── Riepilogo ──────────────────────────────────────────────────── -->
    <DataState
      :stato="adminStore.risorsaRiepilogo.stato"
      :last-updated="adminStore.risorsaRiepilogo.lastUpdated"
      messaggio-errore="Non è stato possibile caricare il riepilogo."
      skeleton-type="card"
      @riprova="adminStore.risorsaRiepilogo.riprova()"
    >
      <div v-if="riepilogo" class="admin__metriche">
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Utenti totali</p>
          <p class="admin__metrica-valore">{{ riepilogo.utenti_totali }}</p>
        </WCard>
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Premium Beta</p>
          <p class="admin__metrica-valore">
            {{ riepilogo.beta.occupati }} / {{ riepilogo.beta.limite }}
          </p>
          <p class="admin__metrica-nota">
            {{ riepilogo.beta.attiva ? `${riepilogo.beta.disponibili} posti liberi` : 'attivazioni chiuse' }}
          </p>
        </WCard>
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Bank Sync attivi</p>
          <p class="admin__metrica-valore">{{ riepilogo.bank_sync.entitlement_attivi }}</p>
          <p class="admin__metrica-nota">
            {{ riepilogo.bank_sync.connessioni_attive }} connessioni
          </p>
        </WCard>
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Connessioni in errore</p>
          <p
            class="admin__metrica-valore"
            :class="{ 'admin__metrica-valore--allarme': riepilogo.bank_sync.connessioni_in_errore > 0 }"
          >
            {{ riepilogo.bank_sync.connessioni_in_errore }}
          </p>
        </WCard>
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Utenti Free</p>
          <p class="admin__metrica-valore">{{ riepilogo.utenti_free }}</p>
          <p class="admin__metrica-nota">senza Bank Sync</p>
        </WCard>
        <WCard class="admin__metrica">
          <p class="admin__metrica-label">Richieste in attesa</p>
          <p class="admin__metrica-valore">
            {{ riepilogo.richieste_premium?.pending ?? 0 }}
          </p>
          <p class="admin__metrica-nota">
            {{ riepilogo.richieste_premium?.totale ?? 0 }} richieste in tutto
          </p>
        </WCard>
      </div>

      <!-- Da dove viene l'accesso di chi ce l'ha. Senza questa riga,
           "12 Bank Sync attivi" non dice se sono dodici posti beta
           consumati o dodici concessioni dello staff: due situazioni
           completamente diverse per chi amministra la quota. -->
      <WCard
        v-if="riepilogo && Object.keys(riepilogo.bank_sync.per_origine || {}).length"
        class="admin__blocco"
      >
        <h2 class="admin__titolo">Origine degli accessi attivi</h2>
        <ul class="admin__origini">
          <li v-for="(quanti, source) in riepilogo.bank_sync.per_origine" :key="source">
            <span class="admin__origine-nome">{{ origineEtichetta(source) }}</span>
            <span class="admin__origine-conta">{{ quanti }}</span>
          </li>
        </ul>
      </WCard>

      <WCard v-if="riepilogo?.ultimi_sync?.length" class="admin__blocco">
        <h2 class="admin__titolo">Ultime sincronizzazioni</h2>
        <div class="admin__tabella-wrap">
          <table class="admin__tabella">
            <thead>
              <tr>
                <th>Utente</th><th>Istituto</th><th>Stato</th>
                <th>Ultima riuscita</th><th>Importati</th><th>Duplicati evitati</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="riga in riepilogo.ultimi_sync" :key="riga.connessione_id">
                <td>#{{ riga.user_id }}</td>
                <td>{{ riga.istituto }}</td>
                <td>
                  {{ riga.stato }}
                  <span v-if="riga.codice_errore" class="admin__errore">{{ riga.codice_errore }}</span>
                </td>
                <td>{{ quando(riga.ultima_riuscita) }}</td>
                <td>{{ riga.movimenti_importati }}</td>
                <td>{{ riga.duplicati_evitati }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </WCard>
    </DataState>

    <!-- ── Utenti ─────────────────────────────────────────────────────── -->
    <WCard class="admin__blocco">
      <h2 class="admin__titolo">Utenti</h2>

      <form class="admin__filtri" @submit.prevent="cerca">
        <label class="admin__ricerca">
          <Search :size="16" :stroke-width="1.75" aria-hidden="true" />
          <input
            v-model="ricerca"
            class="form-input"
            type="search"
            placeholder="Cerca per nome o email"
          />
        </label>
        <label class="admin__checkbox">
          <input v-model="soloBankSync" type="checkbox" @change="cerca" />
          <span>Solo con Bank Sync</span>
        </label>
        <WButton variant="secondary" size="sm" type="submit">Cerca</WButton>
      </form>

      <DataState
        :stato="adminStore.risorsaUtenti.stato"
        :last-updated="adminStore.risorsaUtenti.lastUpdated"
        messaggio-errore="Non è stato possibile caricare gli utenti."
        @riprova="adminStore.risorsaUtenti.riprova()"
      >
        <template #vuoto>
          <p class="admin__vuoto">Nessun utente corrisponde alla ricerca.</p>
        </template>

        <div class="admin__tabella-wrap">
          <table class="admin__tabella">
            <thead>
              <tr>
                <th>Utente</th><th>Piano</th><th>Bank Sync</th>
                <th>Banca</th><th>Ultimo sync</th><th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="utente in utenti" :key="utente.id">
                <td>
                  <span class="admin__nome">{{ utente.nome }}</span>
                  <span class="admin__email">{{ utente.email }}</span>
                </td>
                <td>{{ utente.piano_etichetta }}</td>
                <td>
                  <template v-if="utente.bank_sync">
                    <span :class="utente.bank_sync.stato === 'active' ? 'admin__ok' : 'admin__off'">
                      {{ utente.bank_sync.stato === 'active' ? 'attivo' : utente.bank_sync.stato }}
                    </span>
                    <span class="admin__origine">{{ origineEtichetta(utente.bank_sync.source) }}</span>
                  </template>
                  <span v-else class="admin__off">—</span>
                </td>
                <td>
                  <template v-if="utente.banca">
                    {{ utente.banca.istituto }}
                    <span v-if="utente.banca.codice_errore" class="admin__errore">
                      {{ utente.banca.codice_errore }}
                    </span>
                  </template>
                  <span v-else class="admin__off">—</span>
                </td>
                <td>{{ quando(utente.banca?.ultima_sincronizzazione) }}</td>
                <td class="admin__azioni">
                  <button
                    v-if="!utente.bank_sync || utente.bank_sync.stato !== 'active'"
                    type="button"
                    :disabled="inCorso === `grant-${utente.id}`"
                    @click="concedi(utente)"
                  >
                    Concedi
                  </button>
                  <button
                    v-else
                    type="button"
                    class="admin__azione--pericolo"
                    :disabled="inCorso === `revoke-${utente.id}`"
                    @click="revoca(utente)"
                  >
                    Revoca
                  </button>
                  <button
                    v-if="utente.banca"
                    type="button"
                    class="admin__azione--pericolo"
                    :disabled="inCorso === `unlink-${utente.id}`"
                    @click="scollega(utente)"
                  >
                    Scollega banca
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </WCard>

    <!-- ── Richieste Premium ──────────────────────────────────────────── -->
    <WCard class="admin__blocco">
      <h2 class="admin__titolo">Richieste Premium</h2>
      <p class="admin__nota">
        Chi ha chiesto l'accesso, non chi ce l'ha. Approvare concede Bank Sync
        con origine <strong>staff</strong> e non consuma nessuno dei posti
        beta; rifiutare non toglie diritti ottenuti per altra via.
      </p>

      <div v-if="contatori" class="admin__contatori">
        <span><strong>{{ contatori.pending }}</strong> in attesa</span>
        <span><strong>{{ contatori.approved }}</strong> approvate</span>
        <span><strong>{{ contatori.rejected }}</strong> rifiutate</span>
        <span><strong>{{ contatori.auto_approved_beta }}</strong> beta automatiche</span>
      </div>

      <div class="admin__filtri" role="group" aria-label="Filtra le richieste">
        <button
          v-for="voce in FILTRI_RICHIESTE"
          :key="voce.chiave"
          type="button"
          class="admin__chip"
          :class="{ 'admin__chip--attivo': filtroRichieste === voce.chiave }"
          :aria-pressed="filtroRichieste === voce.chiave"
          @click="filtraRichieste(voce.chiave)"
        >
          {{ voce.etichetta }}
        </button>
      </div>

      <DataState
        :stato="adminStore.risorsaRichieste.stato"
        :last-updated="adminStore.risorsaRichieste.lastUpdated"
        messaggio-errore="Non è stato possibile caricare le richieste."
        @riprova="adminStore.risorsaRichieste.riprova()"
      >
        <template #vuoto>
          <p class="admin__vuoto">Nessuna richiesta con questo filtro.</p>
        </template>

        <p v-if="richieste.length === 0" class="admin__vuoto">
          Nessuna richiesta con questo filtro.
        </p>

        <div v-else class="admin__tabella-wrap">
          <table class="admin__tabella">
            <thead>
              <tr>
                <th>Utente</th><th>Richiesta</th><th>Data</th><th>Stato</th>
                <th>Piano attuale</th><th>Bank Sync</th><th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="riga in richieste" :key="riga.id">
                <td>
                  <span class="admin__nome">{{ riga.nome }}</span>
                  <span class="admin__email">{{ riga.email }}</span>
                  <span class="admin__origine">#{{ riga.user_id }}</span>
                </td>
                <td>{{ riga.requested_feature }}</td>
                <td>{{ quando(riga.requested_at) }}</td>
                <td>
                  <span :class="riga.status === 'pending' ? 'admin__ok' : 'admin__off'">
                    {{ statoEtichetta(riga.status) }}
                  </span>
                  <span v-if="riga.reviewed_at" class="admin__origine">
                    {{ quando(riga.reviewed_at) }}
                    <template v-if="riga.revisore_email"> · {{ riga.revisore_email }}</template>
                  </span>
                  <span v-if="riga.decision_reason" class="admin__origine">
                    {{ riga.decision_reason }}
                  </span>
                </td>
                <td>{{ riga.piano_etichetta || '—' }}</td>
                <td>
                  <template v-if="riga.bank_sync">
                    <span :class="riga.bank_sync.attivo ? 'admin__ok' : 'admin__off'">
                      {{ riga.bank_sync.attivo ? 'attivo' : riga.bank_sync.stato }}
                    </span>
                    <span class="admin__origine">{{ origineEtichetta(riga.bank_sync.source) }}</span>
                  </template>
                  <span v-else class="admin__off">—</span>
                </td>
                <td class="admin__azioni">
                  <button
                    v-if="puoApprovare(riga)"
                    type="button"
                    :disabled="inCorso === `approva-${riga.id}`"
                    @click="apriDecisione(riga, 'approva')"
                  >
                    Approva
                  </button>
                  <button
                    v-if="puoRifiutare(riga)"
                    type="button"
                    class="admin__azione--pericolo"
                    :disabled="inCorso === `rifiuta-${riga.id}`"
                    @click="apriDecisione(riga, 'rifiuta')"
                  >
                    Rifiuta
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </WCard>

    <!-- ── Configurazione ─────────────────────────────────────────────── -->
    <WCard class="admin__blocco">
      <h2 class="admin__titolo">Configurazione</h2>
      <p class="admin__nota">
        Modificabile a caldo, senza deploy. <strong>bank_sync_enabled</strong> è
        l'interruttore d'emergenza: a false nessuna sincronizzazione è
        possibile, nemmeno per chi ha il permesso, e nessun dato viene perso.
      </p>

      <DataState
        :stato="adminStore.risorsaConfig.stato"
        :last-updated="adminStore.risorsaConfig.lastUpdated"
        messaggio-errore="Non è stato possibile caricare la configurazione."
        @riprova="adminStore.risorsaConfig.riprova()"
      >
        <ul class="admin__config">
          <li v-for="voce in configurazione" :key="voce.chiave">
            <div class="admin__config-testo">
              <p class="admin__config-chiave">
                {{ voce.chiave }}
                <span v-if="voce.personalizzato" class="admin__config-tag">modificata</span>
                <span v-if="voce.valore_non_valido" class="admin__errore">valore non valido</span>
              </p>
              <p class="admin__config-descrizione">{{ voce.descrizione }}</p>
            </div>

            <label v-if="voce.tipo === 'boolean'" class="admin__switch">
              <input
                type="checkbox"
                :checked="voce.valore === true"
                :disabled="inCorso === `config-${voce.chiave}`"
                @change="cambia(voce, $event.target.checked)"
              />
              <span>{{ voce.valore ? 'attivo' : 'spento' }}</span>
            </label>

            <input
              v-else-if="voce.tipo === 'intero'"
              class="form-input admin__config-numero"
              type="number"
              :value="voce.valore"
              :disabled="inCorso === `config-${voce.chiave}`"
              @change="cambia(voce, Number($event.target.value))"
            />

            <input
              v-else
              class="form-input admin__config-testo-input"
              type="text"
              :value="voce.valore"
              :disabled="inCorso === `config-${voce.chiave}`"
              @change="cambia(voce, $event.target.value)"
            />
          </li>
        </ul>
      </DataState>
    </WCard>

    <!-- ── Audit ──────────────────────────────────────────────────────── -->
    <WCard class="admin__blocco">
      <h2 class="admin__titolo">Registro eventi</h2>
      <p class="admin__nota">
        Non contiene token, importi né descrizioni di transazione.
      </p>

      <DataState
        :stato="adminStore.risorsaAudit.stato"
        :last-updated="adminStore.risorsaAudit.lastUpdated"
        messaggio-errore="Non è stato possibile caricare il registro."
        @riprova="adminStore.risorsaAudit.riprova()"
      >
        <template #vuoto>
          <p class="admin__vuoto">Nessun evento registrato.</p>
        </template>

        <div class="admin__tabella-wrap">
          <table class="admin__tabella">
            <thead>
              <tr>
                <th>Quando</th><th>Evento</th><th>Soggetto</th>
                <th>Chi ha agito</th><th>Esito</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="evento in audit" :key="evento.id">
                <td>{{ quando(evento.quando) }}</td>
                <td>{{ evento.evento }}</td>
                <td>{{ evento.user_id ? `#${evento.user_id}` : '—' }}</td>
                <td>{{ evento.actor_user_id ? `#${evento.actor_user_id}` : 'sistema' }}</td>
                <td :class="evento.esito === 'ok' ? 'admin__ok' : 'admin__errore'">
                  {{ evento.esito }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DataState>
    </WCard>

    <AppDialog
      :open="!!decisione"
      :title="decisione?.tipo === 'approva' ? 'Approvare la richiesta?' : 'Rifiutare la richiesta?'"
      @close="decisione = null"
    >
      <div v-if="decisione" class="admin__conferma">
        <p class="admin__conferma-testo">
          <template v-if="decisione.tipo === 'approva'">
            <strong>{{ decisione.richiesta.email }}</strong> otterrà la
            sincronizzazione bancaria con origine «staff». Non verrà occupato
            nessuno dei posti della beta gratuita.
          </template>
          <template v-else>
            La richiesta di <strong>{{ decisione.richiesta.email }}</strong>
            resterà registrata come rifiutata. Nessun diritto già posseduto
            viene toccato: per togliere Bank Sync serve la revoca, che è
            un'altra azione.
          </template>
        </p>

        <label class="admin__conferma-campo">
          <span>Motivo (facoltativo)</span>
          <input
            v-model="motivo"
            class="form-input"
            type="text"
            maxlength="300"
            placeholder="Resta nello storico della richiesta"
          />
        </label>

        <div class="admin__conferma-azioni">
          <WButton variant="secondary" size="md" @click="decisione = null">Annulla</WButton>
          <WButton
            :variant="decisione.tipo === 'approva' ? 'primary' : 'danger'"
            size="md"
            :loading="inCorso === `${decisione.tipo}-${decisione.richiesta.id}`"
            @click="confermaDecisione"
          >
            {{ decisione.tipo === 'approva' ? 'Approva' : 'Rifiuta' }}
          </WButton>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.admin { display: flex; flex-direction: column; gap: 1.25rem; }

.admin__metriche {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
}

.admin__metrica { display: flex; flex-direction: column; gap: 0.125rem; }

.admin__metrica-label {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.admin__metrica-valore {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.admin__metrica-valore--allarme { color: var(--warning); }

.admin__metrica-nota {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.admin__blocco { display: flex; flex-direction: column; gap: 0.75rem; }

.admin__titolo {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.admin__nota {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

.admin__filtri {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.admin__ricerca {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1 1 14rem;
  color: var(--text-muted);
}

.admin__ricerca .form-input { flex: 1; }

.admin__checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 44px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Le tabelle larghe scorrono dentro il proprio contenitore: la pagina non
   deve mai scorrere in orizzontale. */
.admin__tabella-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.admin__tabella {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.admin__tabella th {
  padding: 0.5rem 0.625rem;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--glass-primary-border);
  white-space: nowrap;
}

.admin__tabella td {
  padding: 0.625rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--glass-secondary-border);
  vertical-align: top;
}

.admin__nome,
.admin__email,
.admin__origine {
  display: block;
}

.admin__nome { font-weight: 600; color: var(--text-primary); }
.admin__email,
.admin__origine { font-size: var(--text-xs); color: var(--text-muted); }

.admin__ok { color: var(--positive); font-weight: 600; }
.admin__off { color: var(--text-muted); }

.admin__errore {
  display: block;
  font-size: var(--text-xs);
  color: var(--warning);
}

.admin__azioni { display: flex; flex-wrap: wrap; gap: 0.375rem; }

.admin__azioni button {
  min-height: 36px;
  padding: 0.375rem 0.625rem;
  font-size: var(--text-xs);
  font-weight: 600;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.admin__azioni button:hover:not(:disabled) { background: var(--glass-interactive-bg-hover); }
.admin__azioni button:disabled { opacity: 0.6; cursor: default; }

.admin__azioni button:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.admin__azione--pericolo { color: var(--negative) !important; }

.admin__config {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin__config li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
}

.admin__config-testo { flex: 1 1 18rem; min-width: 0; }

.admin__config-chiave {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: ui-monospace, monospace;
}

.admin__config-tag {
  padding: 0.0625rem 0.375rem;
  font-family: inherit;
  font-size: var(--text-micro); /* deroga: etichetta di stato, non testo */
  font-weight: 600;
  color: var(--text-muted);
  background: var(--glass-interactive-bg);
  border-radius: var(--radius-pill);
}

.admin__config-descrizione {
  margin: 0.125rem 0 0;
  font-size: var(--text-xs);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

.admin__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 44px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.admin__config-numero { width: 7rem; }
.admin__config-testo-input { width: 12rem; }

.admin__vuoto {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.admin__contatori {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.admin__contatori strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.admin__chip {
  min-height: 36px;
  padding: 0.375rem 0.75rem;
  font-family: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-interactive-bg);
  border: 1px solid var(--glass-interactive-border);
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.admin__chip--attivo {
  color: var(--text-primary);
  background: var(--glass-interactive-bg-hover);
  border-color: var(--glass-primary-border);
}

.admin__chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.admin__origini {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.admin__origini li {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: var(--glass-secondary-bg);
  border: 1px solid var(--glass-secondary-border);
  border-radius: var(--radius-md);
}

.admin__origine-nome { font-size: var(--text-xs); color: var(--text-secondary); }

.admin__origine-conta {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.admin__conferma { display: flex; flex-direction: column; gap: 0.875rem; }

.admin__conferma-testo {
  margin: 0;
  font-size: 0.875rem;
  line-height: var(--leading-snug);
  color: var(--text-secondary);
}

.admin__conferma-campo {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.admin__conferma-azioni {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
