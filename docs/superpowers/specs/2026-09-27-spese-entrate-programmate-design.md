# Design: spese ed entrate programmate

Data: 27 settembre 2026
Stato: bozza per revisione

## Obiettivo

Rendere semplice programmare movimenti dalla Home e gestire acquisti a rate,
mantenendo distinti gli impegni futuri dai movimenti già pagati. La sezione
attualmente chiamata «Ricorrenti» diventa «Spese/entrate programmate» e riunisce
le regole periodiche esistenti con i pagamenti singoli e le rate ancora da
confermare.

## Decisioni concordate

- Un acquisto può avere un pagamento iniziale e rate future.
- Il numero indicato comprende la quota pagata oggi quando è maggiore di zero.
  Per esempio, 3 pagamenti con 50 € oggi significa due rate future; con quota
  iniziale zero, 3 indica invece tre rate future.
- L'utente sceglie un tasso annuo e WALLT calcola le rate.
- Le rate in scadenza aspettano la conferma dell'utente. Solo la conferma crea
  un movimento effettivo e aggiorna il saldo.
- Anche le entrate singole e ricorrenti restano in attesa della conferma manuale.
  Se l'utente segnala un incasso mancato, la scadenza passa a `in_ritardo` e non
  produce altri avvisi.
- Le spese programmate generano un promemoria cinque giorni prima; le entrate
  programmate generano un avviso il giorno della scadenza.
- La sezione ha un solo accesso alla creazione. Una procedura guidata unificata
  propone date e giorni precompilati e consente di modificarli.
- Dalla Home si deve poter registrare un movimento immediato, programmare un
  singolo movimento futuro o impostare un piano a rate in un'unica procedura.

## Flusso utente

Nel modulo «Aggiungi transazione» una nuova entrata o uscita è registrata
subito con la data di oggi. Il modulo non mostra scelte «Oggi» o «Data futura»
né permette di cambiare la data per un movimento semplice. Un selettore
facoltativo «Programmazione» apre le modalità per data singola, cadenza o rate.
Nel percorso semplice restano visibili importo, categoria e conto; la data viene
impostata automaticamente a oggi:

1. **Una volta, in una data futura**: importo, descrizione, categoria, conto e scadenza. Il
   pagamento resta in attesa; alla conferma WALLT registra il movimento con la
   data effettiva del pagamento.
2. **Cadenza regolare**: importo, categoria, conto, frequenza mensile,
   settimanale o annuale e giorno di esecuzione. Le uscite vengono registrate
   alla scadenza; le entrate diventano scadenze da confermare manualmente.
3. **A rate**: costo dell'acquisto, importo pagato oggi, numero totale dei
   pagamenti, tasso annuo e data della prima rata futura. Il conto, la categoria
   e la descrizione si inseriscono una sola volta. WALLT mostra l'importo delle
   rate, il totale da restituire e gli interessi stimati prima del salvataggio.

Le rate future sono mensili. Si può confermare una rata dalla sezione
«Spese/entrate programmate»; le rate scadute restano visibili finché non sono
pagate o annullate. La data di conferma diventa la data del movimento e viene
aggiornato il saldo del conto scelto. Il server impedisce che la stessa rata
venga confermata due volte.

Le uscite periodiche già esistenti continuano a generare automaticamente i
movimenti alla scadenza. Le entrate periodiche già esistenti generano invece una
scadenza in attesa da confermare, così anche gli incassi sono tracciati senza
anticipare il saldo. Le scadenze singole e le rate richiedono conferma manuale.

## Calcolo delle rate

Il capitale finanziato è il costo dell'acquisto meno l'importo pagato oggi.
Il numero delle rate future è il numero totale dei pagamenti meno uno. Con
tasso zero, il capitale viene diviso in rate mensili uguali. Con tasso annuo
positivo, si usa un piano di ammortamento a rata costante, con tasso mensile
nominale pari al tasso annuo diviso 12. Gli importi sono arrotondati ai
centesimi; l'eventuale differenza di arrotondamento viene assorbita dall'ultima
rata. Il totale e gli interessi stimati vengono mostrati prima della
registrazione.

Il primo pagamento può essere zero. In tal caso, il capitale finanziato è
l'intero costo e il numero indicato corrisponde alle rate future. Se è stato
pagato un importo iniziale positivo e il numero totale dei pagamenti è uno,
quel pagamento deve coprire l'intero importo.

## Architettura e dati

I movimenti effettivi restano nella tabella `movimenti`. Le programmazioni
future devono avere uno stato persistente separato dal ledger, affinché una
rata non pagata non sembri una spesa già avvenuta.

Si propone di aggiungere:

- un'entità di piano di pagamento, con utente, descrizione, conto, categoria,
  costo, importo iniziale, numero dei pagamenti, tasso annuo e totali calcolati;
- righe di pagamento programmate, con importo, scadenza, stato, riferimento al
  piano (opzionale) e riferimento al movimento effettivo dopo la conferma;
- un servizio transazionale per confermare una rata, bloccare la riga durante
  la conferma, creare il movimento, aggiornare il saldo e collegare i record.

Una spesa futura singola usa una riga di pagamento programmato senza piano.
Un acquisto a rate crea il piano e le rate future in un'unica transazione;
quando presente, la quota iniziale viene registrata come movimento effettivo
nella stessa operazione.

Il riepilogo del saldo disponibile include le scadenze non pagate come impegni,
senza sommarle alle spese già avvenute. Le letture Analisi continuano a
conteggiare soltanto i movimenti confermati.

## Compatibilità e sicurezza

- Le regole periodiche e le programmazioni singole già presenti restano
  leggibili e conservano la semantica attuale.
- Le query e le scritture dei nuovi record sono sempre limitate a `user_id`.
- La conferma verifica che conto e programmazione appartengano all'utente.
- Una spesa confermata controlla il saldo secondo le regole attuali dei conti;
  in caso di saldo insufficiente la rata resta da pagare.
- La creazione di un piano con pagamento iniziale e rate future è atomica: se
  una parte fallisce, non rimane un acquisto registrato a metà.
- Le nuove tabelle richiedono migrazioni additive, applicate in produzione
  nello step di deploy previsto dal repository.

## Verifica prevista

La verifica backend coprirà calcolo a tasso zero e positivo, arrotondamento
dell'ultima rata, saldo invariato prima della conferma, aggiornamento del saldo
dopo la conferma, idempotenza, isolamento tra utenti, stato in ritardo senza
nuovi avvisi e promemoria cinque giorni prima. La verifica frontend coprirà la
procedura guidata, le date precompilate e la conferma delle entrate.

## Fuori ambito

- Collegamenti automatici a Klarna o ad altri fornitori.
- Addebiti automatici reali o verifica bancaria del pagamento.
- Piani con scadenze non mensili, rate variabili o tassi variabili.
- Ricalcolo automatico delle rate quando un pagamento è in ritardo.
