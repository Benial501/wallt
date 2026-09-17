# Financial Foundation Frontend — Design

**Data:** 17 settembre 2026
**Branch:** `feature/financial-foundation-frontend`
**Ambito:** esclusivamente frontend, UX, navigazione, Help e test client.

## Obiettivo

Preparare la Financial Experience di WALLT per le future funzionalità finanziarie senza implementare Piano Smart e senza anticipare contratti API del branch backend. Il lavoro rende centralizzata la navigazione delle funzionalità, porta le ricorrenze in una vera pagina, uniforma gli stati delle notifiche e aggiunge una destinazione sicura per le URL sconosciute.

## Vincoli

- Nessuna modifica a modelli, migrazioni, servizi o business logic backend.
- Nessun calcolo frontend di essenzialità, liquidità libera o mesi di copertura.
- Nessun mock permanente di debiti, fondo sicurezza o Piano Smart.
- Le nuove conferme usano `AppDialog.vue`.
- Le nuove letture remote usano `creaRisorsa` e `DataState`.
- Copy utente in italiano e coerenza con tema chiaro/scuro, focus visibile, tastiera, screen reader e preferenze di movimento ridotto.

## Baseline

Il branch parte da `main` al commit `2fa9bf3`.

- `npm test`: 136 test superati, 0 fallimenti.
- `npm run build`: riuscita.
- Il progetto non dichiara uno script `lint` in `client/package.json`.
- La macchina usa Node 20.20.2 mentre il package dichiara Node 22.18+ o 24.12+; test e build riescono comunque.
- La build emette tre avvisi preesistenti su import dinamici inefficaci.

## 1. Catalogo centralizzato delle funzionalità

Un nuovo modulo sotto `client/src/config/` conterrà l'elenco dichiarativo delle funzionalità. Ogni voce avrà almeno:

- `id` stabile;
- `label` e `description`;
- `icon` risolta tramite il catalogo icone esistente;
- `route`;
- stato attivo;
- destinazioni di navigazione, per esempio sidebar e bottom sheet;
- eventuale requisito di visibilità o accesso.

Il modulo esporrà una funzione pura che filtra le voci usando un piccolo contesto di accesso derivato dall'auth store. Il catalogo non importerà Pinia e non conterrà logica finanziaria. Questo permette di testarlo con il runner Node già presente.

`AppLayout.vue` deriverà sia la sidebar desktop sia il bottom sheet mobile da questo catalogo. Le voci strutturali non appartenenti alle funzionalità, come Home, Movimenti e Impostazioni, rimarranno locali al layout. Aiuto resterà nel footer desktop e comparirà nel bottom sheet tramite la stessa configurazione.

Una futura funzionalità, come Piano Smart o Debiti e finanziamenti, richiederà una singola voce nel catalogo e la relativa route quando il backend sarà disponibile.

## 2. Ricorrenti

### Dati

`movimenti.store.js` avrà una risorsa dedicata costruita con `creaRisorsa`:

- fetcher: `GET /movimenti/ricorrenti`;
- dato iniziale: array vuoto;
- stato: caricamento, errore, errore con dati, vuoto o pronto;
- retry con gli stessi argomenti;
- reset insieme al resto dello store.

La nuova pagina `/ricorrenti` mostrerà per ogni movimento:

- descrizione, con fallback leggibile se assente;
- importo formattato nella valuta utente;
- entrata o uscita, comunicata con testo e icona oltre al colore;
- frequenza mensile;
- prossima esecuzione calcolata esclusivamente dal giorno mensile già restituito dal movimento, senza simulare esecuzioni o regole finanziarie;
- conto associato;
- stato attivo. L'API attuale restituisce solo record con `ricorrente: true`, quindi la pagina può rappresentare solo lo stato attivo.

### Azioni supportate

- **Modifica:** apertura del `MovimentoForm` esistente e salvataggio tramite `PUT /movimenti/:id`.
- **Elimina:** conferma con `AppDialog`, poi `DELETE /movimenti/:id` e ricarica della risorsa.

Pausa e riattivazione non saranno offerte: il backend non espone uno stato di pausa né un endpoint che elenchi ricorrenze sospese. Impostare `ricorrente: false` farebbe sparire definitivamente la voce dalla sola query disponibile e non fornirebbe un percorso reale di riattivazione.

## 3. Notifiche e DataState

La lista notifiche diventerà una risorsa `creaRisorsa`. La risposta conserverà insieme lista, totale e conteggio non letto, così un successo aggiorna i valori in modo coerente. I computed pubblici manterranno l'interfaccia usata dai componenti.

Un errore di rete:

- non azzera i dati precedenti;
- produce `errore` se non è mai esistita una risposta valida;
- produce `errore-con-dati` se la lista precedente è ancora disponibile;
- non viene mai rappresentato come “Nessuna notifica”.

`NotificheView.vue` e `NotifichePanel.vue` useranno `DataState` e offriranno il retry. Il polling del solo badge resterà silenzioso in caso di errore, perché non deve interrompere l'utente. Le operazioni di scrittura continueranno a gestire i propri errori e aggiorneranno il dato conservato dopo il successo.

## 4. Route 404

Il router riceverà una catch-all finale. La vista 404 sarà pubblica e coerente con il visual system WALLT, così funzionerà anche per un utente non autenticato. Conterrà:

- messaggio chiaro;
- pulsante per tornare alla Home, che le guardie esistenti instraderanno verso login/onboarding quando necessario;
- azione “Torna indietro” solo quando esiste una cronologia utile;
- focus visibile e landmark semantici.

La catch-all resterà dopo tutte le route specifiche e non interferirà con le guardie di autenticazione.

## 5. Preparazione ai concetti del branch backend

Non verranno create UI per essenzialità, fondo sicurezza o debiti in assenza di un contratto API presente nel branch. La preparazione concreta è limitata a confini che non generano codice morto:

- il catalogo di funzionalità accetta future voci e regole di accesso;
- i componenti esistenti continueranno a mostrare campi aggiuntivi solo quando una risposta reale li renderà disponibili;
- il report finale elencherà dati ed endpoint mancanti.

Dopo il merge backend servirà verificare almeno:

- forma e valori del campo di essenzialità e relativo endpoint di modifica;
- forma di `tipo_obiettivo`, mesi di copertura e testo esplicativo del fondo sicurezza;
- endpoint CRUD e forma dati per debiti e finanziamenti.

## 6. Help

Il catalogo Help verrà aggiornato soltanto per ciò che esiste nel branch:

- come aprire Funzionalità su mobile e desktop;
- come leggere e gestire Ricorrenti;
- significato degli stati di caricamento, mancato aggiornamento e retry delle notifiche.

Non saranno documentati essenzialità, fondo sicurezza, liquidità libera o debiti.

## 7. Direzione visuale e accessibilità

Le nuove pagine riuseranno i token e i componenti WALLT invece di introdurre un linguaggio separato.

- **Colori:** `--text-primary`, `--text-secondary`, `--accent-green`, `--positive`, `--negative` e superfici glass già esistenti.
- **Tipografia:** scala esistente, con pavimento `--text-xs`; niente nuove famiglie.
- **Layout:** intestazione compatta e lista verticale leggibile su mobile; righe informative più dense su desktop. Gli importi restano facilmente confrontabili e allineati.
- **Principio distintivo:** la ricorrenza viene trattata come un calendario operativo, non come una griglia generica di card.
- **Accessibilità:** touch target di almeno 44 px per le nuove azioni, `aria-label` dove il testo visibile non basta, icone decorative nascoste, focus visibile e nessuna informazione affidata solo al colore.

La direzione è volutamente sobria: il lavoro estende l'app esistente e non ridisegna la Home o il design system.

## 8. Strategia di test

Lo sviluppo seguirà cicli RED–GREEN–REFACTOR. Poiché il progetto non usa jsdom o Vue Test Utils, la logica testabile sarà estratta in moduli JavaScript puri e le viste saranno coperte anche da guardie statiche coerenti con la suite esistente.

Test previsti:

1. una voce del catalogo raggiunge tutte le destinazioni configurate;
2. visibilità e restrizioni del catalogo;
3. formattazione e dati richiesti dalle righe Ricorrenti;
4. stati vuoto ed errore della risorsa Ricorrenti;
5. errore notifiche distinto dallo stato vuoto;
6. retry notifiche e conservazione dei dati validi;
7. catch-all 404 presente e ordinata correttamente;
8. controlli statici di accessibilità per le nuove UI;
9. suite frontend completa e build.

La verifica browser coprirà le route richieste su viewport mobile e desktop, console, tastiera e stati principali. Le route che richiedono dati reali saranno verificate con l'account e il backend locale disponibili; eventuali limiti ambientali saranno riportati senza introdurre mock permanenti.

## 9. Confini dei commit

I commit saranno logici e limitati al frontend:

1. centralizzazione catalogo Funzionalità;
2. pagina e stato Ricorrenti;
3. stato affidabile delle notifiche;
4. route e vista 404;
5. Help, accessibilità e verifiche finali.

Non verrà eseguito alcun push su `main`.
