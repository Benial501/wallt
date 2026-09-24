# Piano Smart V1 — Frontend Design

## Obiettivo

Implementare l'esperienza frontend completa di Piano Smart in WALLT: accesso dalla pagina Funzionalità, wizard breve, readiness e domande dinamiche, preview del piano, personalizzazione, salvataggio, storico e dettaglio.

Il backend resta l'unica fonte di verità per profilo finanziario, readiness, allocazioni raccomandate, motivazioni, warning e validazioni definitive. Il client gestisce esclusivamente stato UI, input elementari e calcoli visuali temporanei.

## Vincoli

- Nessuna modifica a migration, modelli, controller, Allocation Engine o sicurezza backend.
- Nessun fallback fake in produzione e nessun motore finanziario nel browser.
- Riutilizzo del design system e dei pattern esistenti: router, Axios, Pinia, `DataState`, toast, dialog, formatter monetari e icone.
- Mobile first, accessibile da tastiera e senza dipendenza dai soli colori.
- Il contratto API reale del backend parallelo è la fonte per nomi, enum, DTO ed errori quando disponibile.

## Architettura

### Accesso e routing

`client/src/config/functionalityItems.js` riceve una nuova voce Piano Smart con route `/funzionalita/piano-smart`. `client/src/router/routes.js` aggiunge la view lazy sotto il layout autenticato e onboarding-complete.

La card usa lo stesso componente/layout delle altre funzionalità e non modifica Home o navigazione principale.

### View e componenti

La view principale sarà `client/src/views/PianoSmartView.vue`. La logica di dominio UI sarà contenuta in `client/src/stores/pianoSmart.store.js` e il trasporto in `client/src/api/pianoSmart.api.js` o nel modulo API equivalente già adottato dal repository.

Componenti previsti in `client/src/components/piano-smart/`, mantenendo componenti compositi e non microscopici:

- wizard importo/contesto;
- domande dinamiche e stato dati mancanti;
- risultato con riepilogo e cinque categorie;
- spiegazioni e dati utilizzati;
- personalizzazione con allocazioni raccomandate/finali;
- storico e dettaglio piano.

La view gestisce tab “Crea piano” e “I miei piani”, oltre all’apertura del dettaglio.

### Stato

Lo store espone stato esplicito equivalente a:

`idle`, `contextLoading`, `needsInput`, `generating`, `previewReady`, `saving`, `saved`, `error`.

Conserva separatamente:

- input originale;
- readiness/context;
- risposte manuali temporanee;
- preview backend;
- allocazioni `recommended`;
- allocazioni `final`;
- lista piani e dettaglio;
- errore classificato.

Il reset delle allocazioni copia i valori raccomandati senza modificarli.

## Flusso dati

1. L'utente inserisce importo, origine, ricorrenza e spese obbligatorie.
2. Il client applica solo validazioni UI di base e mostra il capitale temporaneamente organizzabile.
3. Il client chiama `GET /api/piano-smart/readiness` quando il contesto è necessario.
4. Se il backend restituisce domande, vengono renderizzate dinamicamente per tipo e le risposte restano limitate al piano corrente.
5. Il client invia `POST /api/piano-smart/preview` con input e risposte manuali.
6. La preview mostra le cinque categorie, importi, percentuali, metadata, motivazioni, warning e dati utilizzati restituiti dal backend.
7. L'utente può modificare le cinque allocazioni. Il client mostra solo il residuo locale e impedisce il salvataggio se il totale non coincide con `allocatableCapital`.
8. Il client invia `POST /api/piano-smart` con input originali e allocazioni finali, secondo il contratto reale.
9. Dopo il salvataggio aggiorna storico o dettaglio e mostra il toast di conferma.
10. Storico e dettaglio usano `GET /api/piano-smart` e `GET /api/piano-smart/:id`; le azioni di stato usano il `PATCH` previsto dal contratto.

## UX e stati limite

- Readiness: loading leggibile, warning discreti per storico limitato e messaggi specifici per dati insufficienti.
- Errori: distinzione tra rete, dati mancanti e errore server/calcolo, senza stack trace.
- Zero capitale: nessun grafico 0/0 o NaN; mostrare entrata, spese obbligatorie e capitale libero con messaggio esplicativo.
- Nessun obiettivo: nessun goal fittizio; mostrare suggerimento verso la sezione Obiettivi solo se il backend indica allocation obiettivi pari a zero per assenza di goal.
- Empty history: messaggio e CTA per creare il primo piano.
- Salvataggio: disabilitare doppio submit, gestire loading e fallimento.
- Modal “Come funziona?” con focus/escape pattern coerente con i dialog esistenti.

## Accessibilità e responsive

- Label e messaggi di errore associati agli input.
- Focus visibile, navigazione da tastiera e target touch adeguati.
- Barra allocazioni accompagnata da testo e tabella/lista leggibile, non solo colore.
- Layout verticale su mobile, contenuto centrato e leggibile su desktop, nessun overflow orizzontale.

## Test

I test frontend useranno fixture/mock API soltanto nel codice di test. Saranno coperti almeno:

- card e routing;
- validazione importo e spese obbligatorie;
- readiness loading, domande e assenza domande;
- preview con cinque categorie e motivazioni;
- personalizzazione, residuo, somme inferiori/superiori e reset;
- salvataggio e doppio submit;
- storico vuoto/pieno, dettaglio e azioni di stato;
- errori API e zero capitale.

La verifica finale includerà test frontend, build e browser verification desktop/mobile quando l'API backend sarà disponibile.

## Dipendenze dal backend

Prima dell'integrazione finale occorre confrontare il client con il contratto reale per:

- endpoint e metodo delle azioni di stato;
- enum di origine/ricorrenza e tipi di domanda;
- forma delle allocazioni e metadata goal/sicurezza;
- formato monetario e messaggi errore;
- condizioni di salvataggio con capitale allocabile pari a zero.

In assenza del backend pronto, il client può essere sviluppato contro fixture di test e il contratto concettuale fornito, senza introdurre endpoint alternativi o dati fake runtime.

## Criteri di completamento

Il frontend è completo quando il flusso Funzionalità → Wizard → Readiness → Preview → Risultato → Personalizzazione → Salvataggio → Storico → Dettaglio è collegato al client API reale, testato, accessibile, responsive e privo di business logic finanziaria duplicata.
