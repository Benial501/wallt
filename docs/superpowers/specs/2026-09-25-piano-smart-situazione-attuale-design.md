# Piano Smart — Situazione attuale e orientamento finanziario

## Obiettivo

Evolvere Piano Smart da flusso centrato sulla distribuzione di una nuova entrata a centro decisionale di WALLT. La pagina deve aiutare prima l'utente a capire quanto può spendere con i soldi che ha oggi e come arrivare a fine mese; solo dopo deve offrire una visione più ampia di patrimonio, debiti, fondo sicurezza e obiettivi.

La funzione non dà voti morali, non è consulenza professionale e non modifica automaticamente saldi, movimenti o altre entità finanziarie.

## Gerarchia dell'esperienza

1. **Situazione di oggi**: liquidità disponibile, impegni residui, margine libero e limite giornaliero.
2. **Previsione del mese**: risultato previsto a fine mese, ritmo di spesa e affidabilità.
3. **Cosa fare adesso**: massimo tre azioni ordinate per priorità, ognuna spiegata e con effetto stimato.
4. **Direzione finanziaria**: patrimonio, debiti, fondo sicurezza e obiettivi.
5. **Crea un piano**: piano mensile, nuova entrata o obiettivo, con gli scenari V2 già esistenti.

## Contratto concettuale

Il backend resta l'unica fonte di verità. La risposta distingue sempre:

- valori osservati dai movimenti e dai conti;
- valori stimati dal ritmo storico o dalle ricorrenze;
- valori manuali inseriti dall'utente;
- dati non stimabili e motivo della limitazione.

La pagina deve funzionare anche con dati incompleti: mostra un risultato parziale e una spiegazione, non inventa zeri né nasconde l'incertezza.

## Situazione corrente

Il riepilogo deve fornire almeno:

- liquidità attuale;
- spese del mese già effettuate;
- impegni obbligatori ancora previsti;
- riserva minima da proteggere, se stimabile;
- margine di spesa corrente;
- prossima entrata nota o data di riferimento;
- giorni residui;
- spesa giornaliera sostenibile quando calcolabile.

Il margine non è un semplice saldo del conto: deve considerare gli impegni futuri e le destinazioni che l'utente ha scelto di proteggere. Quando la data della prossima entrata non è disponibile, la pagina espone esplicitamente l'orizzonte usato.

## Previsione

La previsione usa i servizi finanziari esistenti, il calendario corrente, le spese ricorrenti attive e il ritmo osservato. Non usa AI per inventare numeri né simulazioni probabilistiche.

La risposta deve poter comunicare:

- margine previsto a fine mese;
- differenza rispetto al ritmo sostenibile;
- categorie o impegni che spiegano lo scostamento;
- qualità del dato e mesi completi utilizzati.

## Suggerimenti

Il motore produce azioni deterministiche, ordinate per impatto e urgenza, con:

- titolo breve;
- motivo basato sui dati;
- effetto stimato;
- rischio o conseguenza se ignorata;
- eventuale azione collegata (creare piano, aprire budget, verificare ricorrenza, classificare movimento).

La UI mostra al massimo tre suggerimenti principali e consente di espandere gli altri solo se disponibili. Nessun suggerimento deve modificare dati finanziari senza una conferma esplicita tramite un flusso separato.

## Direzione finanziaria

La parte inferiore riusa i dati di dominio già disponibili:

- patrimonio netto e variazione;
- debiti residui, rate e pressione sul reddito;
- copertura del fondo sicurezza;
- obiettivi attivi, residuo e data stimata.

Questa sezione è secondaria rispetto al mese corrente e non deve spostare l'attenzione dal margine disponibile.

## Compatibilità con V2

Il flusso V2 di creazione piano, scenari, proiezioni e azioni resta compatibile. La nuova pagina aggiunge una modalità di lettura senza convertire automaticamente i piani salvati. La creazione di un piano resta disponibile come azione contestuale e continua a non modificare saldi o movimenti.

Le nuove API devono preferire un endpoint di riepilogo separato o un'estensione versionata del namespace V2, evitando di cambiare in modo incompatibile il contratto preview esistente.

## Frontend

La view parte dalla situazione corrente e presenta card verticali responsive, con numeri principali leggibili e testi brevi. Il wizard “Crea piano” viene mantenuto come modalità secondaria. Lo store non duplica calcoli: conserva stati e dati restituiti dal backend.

La Home può riusare in seguito il solo risultato principale “quanto puoi spendere”, senza replicare l'intera pagina Piano Smart.

## Sicurezza e test

Ogni lettura resta autenticata e isolata per `user_id`. Preview e riepilogo non scrivono dati finanziari. I test devono coprire:

- mese senza movimenti;
- mese parziale;
- spese ricorrenti e prossime entrate;
- dati insufficienti;
- margine pari a zero;
- liquidità distinta dal margine libero;
- isolamento tra utenti;
- invarianti monetarie in centesimi;
- compatibilità con piani V1/V2 esistenti;
- rendering degli stati non stimabili.

## Fuori perimetro iniziale

- chatbot finanziario;
- streak e gamification;
- esecuzione automatica di suggerimenti;
- collegamento bancario;
- Monte Carlo o previsioni probabilistiche;
- nuovo motore AI per decidere priorità;
- rifacimento completo della Home;
- migrazione dei piani storici.
