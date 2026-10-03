# Configurazione guidata iniziale di WALLT

## Intento e ambito

Un nuovo utente deve poter configurare WALLT in circa 8–10 minuti, riprendere dopo un’interruzione e trovare al primo accesso categorie, conti, regole ricorrenti, obiettivi e preferenze realmente salvati. Un percorso minimale resta possibile. L’ordine è vincolante: scopi, categorie, entrate, spese fisse, abbonamenti, impegni, conti, import, obiettivi, preferenze, riepilogo, finalizzazione, completamento. L’audit tecnico è in `docs/ONBOARDING_AUDIT.md`.

## Scelta architetturale

Sono state considerate tre vie:

1. **Bozza persistente e finalizzazione unica**: consente ripresa, revisione e rollback; richiede di adattare l’anteprima import ai dati ancora in bozza. È la scelta adottata.
2. Scrivere ogni sezione nelle tabelle definitive: riusa direttamente le API correnti, ma un’interruzione o errore lascerebbe un account parziale e la compensazione attraverserebbe molte entità.
3. Finalizzare i dati finanziari e importare dopo: semplice per i file, ma non soddisfa il riepilogo e la conferma unica richiesti.

La bozza vive in una nuova `onboarding_sessions` con una sola sessione per utente, `schema_version`, `current_step`, `status`, `answers` JSONB, revision e date. Le righe estratto confermate vivono in una tabella di staging separata, con riferimento alla sessione, chiave conto bozza e dati normalizzati; il file originale non viene conservato. La bozza ha limiti di dimensione e quantità. Entrambe le tabelle hanno FK con cancellazione a cascata, RLS attiva e privilegi diretti revocati a `anon` e `authenticated`.

Il client usa uno store Pinia e salva per sezione, con debounce e indicatore `Salvataggio…`/`Salvato`. Un fallimento conserva i campi sullo schermo e una copia locale per riprovare; il server resta fonte di verità al rientro. Il numero di fase e il progresso derivano da sezioni completate, anche quando sono saltate. Le sezioni facoltative sono esplicite. Il riepilogo usa soltanto dati della bozza, mai importi dedotti.

## Compatibilità

Le nuove registrazioni locali e Google ricevono una sessione versione 2. Il servizio di riparazione profilo non deve più completare automaticamente queste sessioni dopo 15 minuti. I profili vecchi senza sessione continuano a usare `onboarding_completato` come oggi; nessun account vecchio viene reindirizzato. L’eventuale riapertura manuale del questionario legacy resta separata dal percorso nuovo. La fascia d’età è richiesta anche nel percorso minimale per applicare le restrizioni ai minori.

## Dati configurati

- **Categorie**: le predefinite partono da una selezione consigliata; quelle non scelte diventano righe in `categorie_default_nascoste`. Le categorie tecniche rimangono sempre attive. Le categorie personali usano `categorie_personali` e identificativi stabili nella bozza per referenziarle prima della creazione.
- **Entrate, spese, abbonamenti**: diventano regole in `movimenti` con `ricorrente: true`, data di inizio e frequenza supportata. Un abbonamento è una spesa ricorrente, non una riga in `subscriptions`. Il conto viene scelto con una lista rapida dopo la fase conti. Nessuna regola crea un movimento avvenuto né aggiorna il saldo durante la configurazione.
- **Impegni**: quando è noto il saldo residuo, si può creare un `Debito`. La sola rata è una ricorrenza di uscita; non si crea un debito dal valore ipotizzato. La UI spiega che debiti e ricorrenze non sono riconciliati automaticamente.
- **Conti**: si usano i tipi e i campi realmente supportati. La valuta è globale; nessuna domanda su istituto o inclusione nel patrimonio se il dato non ha una destinazione. Il saldo attuale dichiarato è una fotografia iniziale: l’onboarding non crea un’entrata fittizia “Saldo iniziale”.
- **Import**: upload CSV/XLS/XLSX in memoria, parser e classificatore esistenti con elenco delle categorie scelte in bozza e conti temporanei. L’anteprima permette di correggere, escludere e confermare ogni riga; quelle incerte sono `da_verificare`. Lo staging salva solo righe normalizzate approvate, con limiti. All’atto finale si associano ai conti definitivi e si riusa l’apprendimento di categoria. I movimenti storici non modificano il saldo attuale dichiarato. Il PDF non viene promesso perché l’API attuale non lo supporta.
- **Obiettivi**: diventano righe `obiettivi`, senza spostamenti o contributi automatici. Il fondo di emergenza usa un conto `emergenza` quando l’utente decide di crearlo, secondo la regola corrente.
- **Preferenze**: solo colonne disponibili in `preferenze_notifiche`; push spenta fino al consenso esplicito del browser. Nessuna nuova famiglia di notifiche priva di generatore.

## Finalizzazione

`POST /api/onboarding/finalize` usa soltanto `req.userId`, blocca la sessione in transazione, valida integralmente la bozza e impedisce modifiche concorrenti. Nella stessa transazione crea categorie, conti, regole, eventuali debiti, movimenti importati, obiettivi e preferenze; infine completa `profili_utente` e la sessione. Una seconda chiamata sulla sessione completata restituisce lo stesso esito e non scrive duplicati. La logica di import deve accettare una transazione esterna; la rotta import normale conserva il proprio comportamento. Eventi, email, invalidazioni cache e notifiche immediate avvengono solo dopo commit e non condizionano l’esito finanziario.

Le API per leggere/salvare la bozza e caricare/approvare l’import richiedono JWT e ricavano sempre l’utente dal token. I riferimenti a conto e categoria sono verificati contro la bozza del medesimo utente; l’input viene rifiutato se eccede limiti o versione supportata. Gli estratti non entrano nei log o negli analytics.

## Esperienza dopo la conferma

Una schermata “Il tuo WALLT è pronto” mostra conteggi verificati dal server e il collegamento alla Home. La Home esistente legge le entità create; evidenzia i moduli pertinenti agli scopi selezionati senza creare dashboard parallele. Gli stati vuoti restano utili per chi ha saltato quasi tutto. Piano Smart e Financial Brain leggono il contesto finanziario esistente e dichiarano i limiti quando manca lo storico.

## Prove richieste

Test di validazione bozza, ripresa, isolamento tra utenti, selezione categorie, associazione conto, import con correzioni, rollback su errore, due finalizzazioni concorrenti, saldi invariati dall’import storico, account precedenti e minori. Verifica dei tre scenari prodotto (semplice, completo, minimale) e del rientro dopo interruzione. Suite backend sul database locale di test con Node 22/24; test e build frontend. Nessuna scrittura sul database Supabase collegato durante i test.
