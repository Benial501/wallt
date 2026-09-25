# Saldo effettivo, conti nascosti e spese programmate — design

> Data: 2026-09-25 · Stato: approvato in brainstorming, non ancora implementato.
> Percorso: architetturale (migrazione DB, modifica al cron, due superfici
> nuove in home).

## Il problema

Il patrimonio totale risponde a "quanto possiedo". Non risponde a "quanto
posso spendere", che è la domanda che l'utente si fa davvero prima di una
spesa. Oggi la home mostra solo il primo numero, e tre categorie di denaro
non spendibile ci finiscono dentro senza distinzione:

1. **I conti che l'utente non considera spendibili** — il conto risparmi.
   Vuole vederlo nel patrimonio (è suo), non fra i soldi di oggi.
2. **Il denaro già promesso a un obiettivo** — `Obiettivo.importo_attuale`
   non viene mai sottratto dal saldo dei conti, quindi lo stesso euro
   risulta libero due volte.
3. **Le uscite già note ma non ancora addebitate** — l'affitto del mese,
   e le spese che l'utente sa già di dover sostenere in una data precisa
   (un evento, un viaggio) e che oggi non ha modo di annotare.

## Cosa esiste già

`server/services/liquidita.service.js` calcola `liquidita_libera` = saldo
conti attivi − obiettivi non completati − ricorrenti del periodo corrente
non ancora addebitate, ed è esposto da `GET /api/conti/liquidita`. I punti
2 e 3 (parziale) sono quindi già risolti, in un servizio che Piano Smart
consuma già.

**Il saldo effettivo non è un concetto nuovo: è quella liquidità, estesa.**
Nasce dentro `liquidita.service.js` o non nasce. Un secondo punto di calcolo
sarebbe il difetto che la Regola 20 del CLAUDE.md descrive — il patrimonio
era duplicato in quattro file e uno era divergiuto.

## Decisioni prese

| Domanda | Decisione |
|---|---|
| Un conto nascosto conta nel patrimonio? | **Sì.** Resta nel patrimonio totale, esce dal saldo effettivo. |
| Vale anche per Piano Smart? | **Sì.** "Nascosto" ha un significato solo. Cambia il contesto finanziario: un piano rigenerato può proporre importi diversi da uno salvato prima. I piani già salvati non vengono toccati. |
| Una spesa programmata si addebita da sola? | **Sì**, come una ricorrente: il cron crea il movimento vero alla data indicata. |
| Cosa resta dopo l'addebito? | Il promemoria passa a `stato_ricorrenza: 'terminata'`: esce dagli impegni e dalla card, resta come storico in Ricorrenti. |
| Da quando una spesa programmata pesa sul saldo effettivo? | **Entro 30 giorni** dalla data, lo stesso orizzonte delle ricorrenti mensili. Prima si vede solo nella card. |
| I conti scommesse? | Restano dentro come oggi. Chi non li vuole spendibili li nasconde: una regola esplicita dell'utente invece di una implicita nel codice. |

## Dati

Una migrazione, due colonne:

- `conti.nascosto` BOOLEAN NOT NULL DEFAULT false — accanto ad `attivo`.
- `movimenti.ricorrente_data` DATEONLY nullable — la data dell'addebito
  unico. Ha senso solo con `ricorrente_frequenza = 'una_tantum'`.

**Verificato sul database, non dedotto**: `movimenti.ricorrente_frequenza` è
`varchar(20)`, non un ENUM Postgres — il model dichiara `DataTypes.ENUM` ma
la colonna nasce `STRING(20)` nella migrazione `20250101000001` e nessuna
migrazione successiva l'ha convertita. Aggiungere `'una_tantum'` non
richiede nessun `ALTER TYPE`: bastano il model e la validazione. Va comunque
aggiornato il model, altrimenti Sequelize continua a dichiarare un insieme
di valori che non contiene quello nuovo.

`movimenti.ricorrenza_periodo` è `varchar(10)`, esattamente la lunghezza di
`YYYY-MM-DD`: l'indice unico `uniq_movimenti_ricorrenza_periodo
(ricorrenza_origine_id, ricorrenza_periodo)` che oggi rende il cron sicuro
da rieseguire copre le spese programmate senza modifiche allo schema.

## Motore

Tutto in `liquidita.service.js`:

```
saldo_effettivo = saldo dei conti attivi NON nascosti
                − obiettivi non completati (importo_attuale)
                − ricorrenti del periodo corrente non ancora addebitate
                − spese programmate entro 30 giorni non ancora addebitate
```

"Entro 30 giorni" significa `ricorrente_data <= oggi + 30 giorni`, comprese
quelle con data già passata e non ancora addebitate: sono le più certe di
tutte, e sottrarle è il caso per cui il saldo effettivo esiste.

Campi nuovi nella risposta del servizio:

- `saldo_effettivo`
- `saldo_conti_nascosti` — quanto è stato escluso, così la differenza col
  patrimonio è verificabile e non un salto inspiegato
- ogni voce di `impegni` guadagna `tipo` (`ricorrente` | `programmata`) e
  `data`

`liquidita_allocabile` (il capitale che Piano Smart distribuisce) esclude a
sua volta i conti nascosti, per la decisione sopra. `liquidita_libera` resta
la somma su tutti i conti attivi: significato invariato per chi già la
consuma.

**N+1 da chiudere**: oggi `calcolaLiquidita` esegue una `findOne` per ogni
movimento ricorrente. Finché il servizio stava dietro un endpoint dedicato
era tollerabile; dal momento che entra in `GET /conti/patrimonio`, che si
apre a ogni visita della dashboard, diventa una query sola su tutte le
chiavi di periodo.

## Cron (area sensibile: crea movimenti da solo)

In `ricorrenti.service.js`:

- `'una_tantum'` entra in `FREQUENZE_SUPPORTATE`.
- `periodoPerFrequenza` per `una_tantum` restituisce la data stessa
  (`2026-03-15`): entra nell'indice unico e rende impossibile il doppio
  addebito.
- `valutaOccorrenza`: **dovuta quando `oggi >= ricorrente_data`**, non solo
  il giorno esatto. Se il cron non gira quel giorno (deploy, downtime) la
  spesa viene recuperata al passaggio successivo invece di sparire in
  silenzio; l'indice unico garantisce che avvenga una volta sola.
- Dopo l'addebito, nella **stessa transazione** del movimento, il promemoria
  passa a `stato_ricorrenza: 'terminata'`. `whereRicorrenzaAttiva()` lo
  esclude quindi da sé dagli impegni della liquidità: nessuna riga zombie
  che continua a bloccare denaro.

## API

Nessun endpoint nuovo.

| Endpoint | Modifica |
|---|---|
| `GET /conti/patrimonio` | aggiunge `saldo_effettivo` e il suo dettaglio, delegando a `liquidita.service`. La home ottiene entrambi i numeri in una chiamata sola: non possono divergere nel tempo. |
| `GET /conti/liquidita` | stessi campi nuovi (stesso servizio). |
| `GET /movimenti/ricorrenti` | invariato: le spese programmate sono `ricorrente: true` e ci finiscono dentro. L'ordinamento della card è lato client. |
| `POST` / `PUT /movimenti` | `'una_tantum'` ammesso; `ricorrente_data` obbligatoria con quella frequenza e rifiutata con le altre; data non nel passato alla creazione. |
| `POST` / `PUT /conti` | campo `nascosto`. |

## Interfaccia

**Pagina Conti** — switch "Nascondi dal saldo effettivo" nel form, con la
riga di spiegazione ("Il conto resta nel patrimonio totale, ma i suoi soldi
non contano fra quelli spendibili"). Badge discreto sulla card del conto
nascosto: la differenza fra i due numeri deve sempre avere una causa
visibile.

**Home, slide Patrimonio** — sotto l'importo grande e la composizione, una
seconda riga **Saldo effettivo**, più piccola, e sotto la scomposizione del
perché è più basso: `— 1.200 € su obiettivi · — 340 € impegni`. Etichetta e
descrizione in `client/src/content/glossario.js` con un topic di aiuto
dedicato, mai scritte in linea (Regola 18).

**Home, card "Prossime spese"** — sotto il carosello, sopra i movimenti
recenti. Massimo 4 voci: prima le occasionali per data, poi
settimanali/mensili/annuali per imminenza. Ogni voce: descrizione, quando
(`fra 3 giorni` / `15 mar`), importo, conto. In fondo "Vedi tutte →" verso
Ricorrenti. Stato vuoto nello slot `vuoto` di `DataState`, mai un `v-if`
fatto a mano (Regola 17).

**Pagina Ricorrenti** — quarta scelta nel form accanto a
mensile/settimanale/annuale: "Una tantum", che sostituisce il selettore del
giorno con un calendario. Nell'elenco la voce mostra la data invece di "Ogni
mese"; le terminate restano visibili come storico.

## Test

Backend:
- liquidità: conti nascosti esclusi dal saldo effettivo e inclusi nel
  patrimonio; spese programmate dentro e fuori i 30 giorni; `saldo_effettivo`
  con obiettivi e impegni insieme
- cron: esegue alla data giusta, recupera un giorno saltato, non addebita
  due volte, termina il promemoria nella stessa transazione
- validazione: `ricorrente_data` obbligatoria solo con `una_tantum`, rifiuto
  di una data passata alla creazione
- isolamento cross-user su entrambe le colonne nuove

Frontend:
- ordinamento della card "Prossime spese" (occasionali prima, poi per
  imminenza)
- le suite esistenti su glossario, contrasto e tipografia coprono da sole le
  etichette nuove

## Fuori perimetro

- Notifiche per le spese programmate in arrivo (il sistema notifiche esiste,
  ma aggiungerci un tipo è un lavoro a sé con le sue regole anti-spam).
- Legare un obiettivo a un conto specifico (`Obiettivo` non ha `conto_id`):
  resta l'ambiguità già documentata in `liquidita.service.js`.
- Spese programmate ricorrenti "a rate" o con fine programmata.
