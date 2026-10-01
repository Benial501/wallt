/**
 * Interfaccia di un fornitore di pagamento (Stripe, Paddle, altro).
 *
 * ── Cosa fa oggi: niente ─────────────────────────────────────────────────
 * Nessun pagamento è implementato, e questa non è una finta. Non esiste un
 * checkout, non esiste una CTA che renda Premium chi la clicca, non esiste
 * una subscription creata senza un pagamento reale. Gli unici due modi di
 * ottenere Bank Sync sono il posto beta e la concessione amministrativa.
 *
 * ── Perché esiste comunque ───────────────────────────────────────────────
 * Perché il giorno in cui arriva il pagamento reale il percorso sia già
 * tracciato e non richieda di toccare Bank Sync:
 *
 *     evento di billing verificato
 *            ↓
 *     riga in `subscriptions`
 *            ↓
 *     allineaEntitlementDaSubscription()
 *            ↓
 *     entitlement bank_sync con source 'premium_subscription'
 *            ↓
 *     canUseFeature(userId, 'bank_sync') → true
 *
 * Bank Sync non sa — e non deve sapere — che esista un fornitore di
 * pagamento. Chiede solo `canUseFeature`. Questo è il motivo per cui Stripe e
 * Bank Sync non si incontrano in nessun punto del codice.
 *
 * ── Regole non negoziabili per chi implementerà questa interfaccia ───────
 *  1. Un webhook non è una prova d'identità: la firma va verificata con il
 *     segreto del fornitore, lato server, prima di guardare il corpo.
 *  2. `provider_subscription_id` è la chiave di idempotenza. La UNIQUE
 *     parziale su `(billing_provider, provider_subscription_id)` esiste per
 *     questo: lo stesso evento consegnato due volte aggiorna una riga, non
 *     ne crea due, e quindi non concede due entitlement.
 *  3. Nessun segreto nel bundle del client. Le chiavi segrete vivono solo
 *     nelle variabili d'ambiente del server.
 *  4. Il client non dichiara mai quale piano ha comprato: lo dice il
 *     fornitore di pagamento, e lo stato si deriva dalla sua risposta.
 */
class BillingProvider {
  /** Identificatore del fornitore, scritto in `subscriptions.billing_provider`. */
  // eslint-disable-next-line class-methods-use-this
  get nome() {
    throw new Error('BillingProvider.nome non implementato');
  }

  /** Crea una sessione di pagamento e restituisce l'URL a cui mandare
   * l'utente. Non implementato: non esiste nessun checkout. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async creaSessioneCheckout(_dati) {
    throw Object.assign(
      new Error('I pagamenti non sono ancora disponibili'),
      { statusCode: 501 },
    );
  }

  /** Verifica la firma di un webhook e ne restituisce il contenuto tipizzato.
   * Deve lanciare se la firma non è valida: mai fidarsi del corpo. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async verificaEvento(_corpoGrezzo, _firma) {
    throw new Error('BillingProvider.verificaEvento non implementato');
  }

  /** URL del portale di gestione dell'abbonamento, dove l'utente può
   * disdire o cambiare metodo di pagamento. */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async urlPortaleCliente(_dati) {
    throw Object.assign(
      new Error('La gestione abbonamento non è ancora disponibile'),
      { statusCode: 501 },
    );
  }
}

/**
 * L'implementazione attiva: nessun fornitore configurato.
 *
 * Esiste perché il codice che chiede "i pagamenti sono disponibili?" abbia
 * una risposta onesta (`disponibile === false`) invece di un `null` da
 * interpretare, e perché l'interfaccia della pagina del piano possa mostrare
 * "Disponibile prossimamente" invece di un pulsante che non funziona.
 */
class NessunBillingProvider extends BillingProvider {
  get nome() { return 'nessuno'; }

  // eslint-disable-next-line class-methods-use-this
  get disponibile() { return false; }
}

/**
 * Il fornitore in uso. Oggi sempre `NessunBillingProvider`: quando ce ne
 * sarà uno, questa funzione leggerà la configurazione e restituirà
 * l'adapter, e nient'altro nel codice cambierà.
 */
const getBillingProvider = () => new NessunBillingProvider();

/** I pagamenti sono attivi? Letta dalla pagina del piano per decidere se
 * mostrare "Passa a Premium" o "Disponibile prossimamente". */
const pagamentiDisponibili = () => !!getBillingProvider().disponibile;

module.exports = {
  BillingProvider,
  NessunBillingProvider,
  getBillingProvider,
  pagamentiDisponibili,
};
