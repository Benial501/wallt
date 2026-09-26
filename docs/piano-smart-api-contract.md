# Piano Smart V1 — Contratto API (implementato)

> Questo documento descrive il contratto **realmente implementato**, non un
> contratto teorico. Gli esempi sono
> estratti dal serializzatore reale.
>
> Base URL: `/api/piano-smart` · Auth: Bearer JWT su **tutte** le rotte.
> Design: `docs/superpowers/specs/2026-09-24-piano-smart-backend-design.md`.

## Indice rapido

| Metodo | Path | Scopo | Limite |
|---|---|---|---|
| GET | `/api/piano-smart/readiness` | cosa manca, domande, spese obbligatorie suggerite | `apiLimiter` |
| POST | `/api/piano-smart/preview` | calcola il piano, **non salva** | 60 / 15 min per utente |
| POST | `/api/piano-smart` | ricalcola lato server e salva | `apiLimiter` |
| GET | `/api/piano-smart` | elenco dei piani dell'utente | `apiLimiter` |
| GET | `/api/piano-smart/:id` | dettaglio, solo proprietario | `apiLimiter` |
| PATCH | `/api/piano-smart/:id` | allocazioni finali e/o stato | `apiLimiter` |
| DELETE | `/api/piano-smart/:id` | elimina il piano, solo proprietario | `apiLimiter` |

L'archiviazione è `PATCH { status: 'archived' }`, così il piano resta
verificabile. `DELETE` rimuove il piano e le sue allocazioni associate; non
modifica saldi, movimenti, obiettivi o altri dati finanziari.

---

## Prerequisito: CORS

`PATCH` deve comparire in `Access-Control-Allow-Methods` (vedi `server/app.js`).
Prima dell'integrazione non c'era — WALLT non aveva rotte PATCH — e il browser
bloccava il cambio di stato di un piano *dopo* un preflight andato a buon fine:
`Method PATCH is not allowed by Access-Control-Allow-Methods`. I test con
supertest non attraversano CORS e non possono accorgersene; lo sorveglia
`server/tests/corsMetodi.test.js`, che confronta i metodi montati nel router
con quelli dichiarati.

## Formato del denaro

**Ogni importo monetario è una stringa decimale con due decimali**:
`"800.00"`, `"0.00"`, `"-125.40"`. Vale per richieste e risposte,
`contextSummary` compreso, senza eccezioni.

Questa è una **divergenza deliberata** dagli altri endpoint di WALLT, che
serializzano gli aggregati calcolati come numeri JS. La ragione: l'invariante
di Piano Smart è che la somma delle cinque quote sia *esattamente* il capitale
allocabile, e con le stringhe il client può verificarlo senza aritmetica float.

**Non sono importi e restano numeri**: percentuali (`recommendedPercentage`),
rapporti (`savingsRate`, `debtPressure`), durate (`coverageMonths`,
`targetMonths`), conteggi (`completeMonths`, `stabilityMonths`).

In ingresso il backend accetta stringa o numero, ma applica un criterio severo:
al massimo 10 cifre intere e **al massimo 2 decimali**, virgola ammessa come
separatore, nessun segno, nessuna notazione esponenziale. `"100.005"` viene
**rifiutato**, non arrotondato: arrotondare significherebbe decidere al posto
dell'utente su una cifra di denaro.

Un valore assente è `null`, mai `"0.00"`. A capitale allocabile zero le
percentuali sono `null`, perché una quota di un capitale inesistente non è lo
0%.

## Enum

```
category          needs | safety | goals | future | freedom     (ordine fisso)
sourceType        stipendio | pensione | compenso | bonus |
                  regalo | rimborso | vendita | altro
status            draft | active | completed | archived
dataConfidence    INSUFFICIENT | LIMITED | GOOD
incomeStability   LOW | MEDIUM | HIGH
expensePressure   LOW | MEDIUM | HIGH            | null se non calcolabile
savingsCapacity   NEGATIVE | LOW | MEDIUM | HIGH | null
emergencyCoverage CRITICAL | LOW | ADEQUATE | STRONG | null
goalPressure      NONE | LOW | MEDIUM | HIGH
debtPressure      NONE | LOW | MEDIUM | HIGH     | null
financialFlexibility LOW | MEDIUM | HIGH         | null
question.type     currency
question.impact   alto | medio
plan status (motore) ok | capitale_zero
```

**`null` in una fascia significa "i dati non lo dicono"**, ed è diverso da un
valore centrale. Le fasce `null` sono elencate in
`financialProfile.unknownBands`. Una fascia `null` non influenza la
ripartizione: il suo modificatore non viene applicato.

Transizioni di stato ammesse:

```
draft     → active, archived
active    → completed, archived
completed → archived
archived  → (nessuna: terminale)
```

---

## GET /api/piano-smart/readiness

Cosa WALLT **non** sa. Una domanda esiste solo se il dato manca davvero: se è
nel FinancialContext non viene chiesto.

**Nessuna domanda blocca il piano**: `required` è sempre `false`. Le risposte
migliorano la stima, non la abilitano — un utente appena registrato può
generare un piano. `impact` distingue le domande che cambiano il risultato da
quelle di rifinitura.

```json
{
  "dataConfidence": "INSUFFICIENT",
  "dataQuality": {
    "confidence": "INSUFFICIENT",
    "completeMonths": 0,
    "historyMonthsAvailable": 0,
    "hasSufficientHistory": false,
    "missingIncomeData": true,
    "missingExpenseData": true,
    "missingClassificationData": false,
    "registrationCompleteness": "non_verificabile",
    "unknownBands": ["expensePressure", "savingsCapacity", "emergencyCoverage"]
  },
  "missingFields": ["monthly_income_average", "essential_monthly_expenses", "liquid_savings"],
  "questions": [
    {
      "key": "essential_monthly_expenses",
      "type": "currency",
      "label": "Quanto spendi al mese per le cose indispensabili?",
      "description": "Affitto o mutuo, bollette, spesa alimentare, trasporti necessari. …",
      "required": false,
      "impact": "alto",
      "validation": { "min": 0, "max": 9999999999.99, "decimals": 2 },
      "options": null,
      "suggestedValue": null
    }
  ],
  "warnings": ["Non ci sono ancora mesi completi registrati: …"],
  "suggestedMandatoryExpenses": {
    "supported": true,
    "amount": "120.00",
    "source": "impegni_ricorrenti_non_addebitati",
    "detail": "Somma delle ricorrenze attive di questo periodo il cui addebito non è ancora avvenuto. …",
    "appliedAutomatically": false
  },
  "contextSummary": { "…": "vedi sotto" }
}
```

Chiavi delle domande: `monthly_income_average`, `essential_monthly_expenses`,
`liquid_savings`, `upcoming_obligations`. Sono anche le sole chiavi ammesse in
`manualContextAnswers`: qualunque altra fa rispondere 400.

`suggestedMandatoryExpenses` è `supported: true` **solo** quando esiste un
numero reale dietro: le ricorrenze attive del periodo corrente il cui addebito
non è ancora avvenuto. Le rate dei debiti non vi entrano — lo schema non collega
un debito a una ricorrenza, e sommarle rischierebbe di contare due volte lo
stesso euro. `appliedAutomatically` è sempre `false`: il valore va **proposto**
all'utente, mai sottratto d'ufficio.

`registrationCompleteness` è sempre `"non_verificabile"`: senza collegamento
bancario WALLT osserva la presenza delle registrazioni, non la loro completezza.

---

## POST /api/piano-smart/preview

Calcola il piano. **Non persiste niente.**

### Richiesta

```json
{
  "amount": "800.00",
  "sourceType": "regalo",
  "recurring": false,
  "mandatoryExpenses": "0.00",
  "manualContextAnswers": { "essential_monthly_expenses": "700.00" }
}
```

| Campo | Obbligatorio | Note |
|---|---|---|
| `amount` | sì | > 0. Zero, negativo, NaN, Infinity, >2 decimali → 400 |
| `sourceType` | sì | uno degli enum |
| `recurring` | sì | booleano **esplicito**: cambia la ripartizione, il motore non lo indovina |
| `mandatoryExpenses` | no | default `0`. Mai sottratto d'ufficio: lo conferma l'utente |
| `manualContextAnswers` | no | solo le quattro chiavi previste |

`allocatableCapital = max(amount − mandatoryExpenses, 0)`.

### Risposta 200

```json
{
  "engineVersion": "smart-v1",
  "status": "ok",
  "incomingAmount": "800.00",
  "mandatoryExpenses": "0.00",
  "allocatableCapital": "800.00",
  "recommendedTotal": "800.00",
  "sourceType": "regalo",
  "recurring": false,
  "financialProfile": {
    "incomeStability": "HIGH", "expensePressure": "LOW",
    "savingsCapacity": "HIGH", "emergencyCoverage": "LOW",
    "goalPressure": "LOW", "debtPressure": "NONE",
    "financialFlexibility": "HIGH", "dataConfidence": "GOOD",
    "unknownBands": [], "manualAnswersUsed": [], "manualAnswersIgnored": []
  },
  "dataConfidence": "GOOD",
  "allocations": [
    {
      "category": "needs",
      "recommendedAmount": "83.88", "recommendedPercentage": 10.49,
      "finalAmount": "83.88", "finalPercentage": 10.49,
      "metadata": {}, "reasonCodes": []
    },
    {
      "category": "safety",
      "recommendedAmount": "296.04", "recommendedPercentage": 37.01,
      "finalAmount": "296.04", "finalPercentage": 37.01,
      "metadata": { "capApplied": false, "fundStatus": "disponibile", "emergencyGap": "1600.00" },
      "reasonCodes": ["LOW_EMERGENCY_BUFFER"]
    },
    {
      "category": "goals",
      "recommendedAmount": "181.57", "recommendedPercentage": 22.7,
      "finalAmount": "181.57", "finalPercentage": 22.7,
      "metadata": {
        "capApplied": false,
        "totalRemaining": "1500.00",
        "goals": [
          {
            "id": 1, "nome": "Vacanza", "priorita": "media",
            "urgenza": "senza_scadenza", "stato": "senza_scadenza",
            "amount": "181.57", "remaining": "1500.00", "score": 1.6
          }
        ]
      },
      "reasonCodes": []
    }
  ],
  "reasonCodes": ["LOW_EMERGENCY_BUFFER", "STABLE_INCOME", "HIGH_SAVINGS_CAPACITY", "EXTRA_INCOME"],
  "reasons": [
    {
      "code": "LOW_EMERGENCY_BUFFER",
      "titolo": "Fondo di sicurezza sotto il traguardo",
      "testo": "Il fondo non copre ancora i mesi di spese essenziali che ti sei dato: …"
    }
  ],
  "warnings": [],
  "contextSummary": { "…": "vedi sotto" }
}
```

Note per il client:

- `allocations` ha **sempre cinque elementi**, nell'ordine
  `needs, safety, goals, future, freedom`.
- In preview `finalAmount` è presente e uguale a `recommendedAmount`, così il
  client lavora su una sola forma di allocazione in preview e in dettaglio.
- `metadata` è `{}` per `needs`, `future`, `freedom`. `safety` ha
  `capApplied`, `fundStatus`, `emergencyGap` (`null` senza fondo definito).
  `goals` ha `capApplied`, `totalRemaining`, `goals[]`.
- `reasons` è al massimo **5** motivazioni, già ordinate per priorità.
  `reasonCodes` è l'elenco completo.
- `reasonCodes` per categoria è un sottoinsieme di quelli del piano: serve a
  spiegare una categoria per volta.

### Capitale zero

Con `amount ≤ mandatoryExpenses`:

```json
{
  "status": "capitale_zero",
  "allocatableCapital": "0.00",
  "allocations": [
    { "category": "needs", "recommendedAmount": "0.00", "recommendedPercentage": null, "finalAmount": "0.00", "finalPercentage": null, "metadata": {}, "reasonCodes": [] }
  ],
  "reasonCodes": ["ZERO_ALLOCATABLE_CAPITAL"],
  "warnings": ["Il capitale disponibile da distribuire è zero: le spese obbligatorie assorbono tutta la somma."]
}
```

Le cinque categorie **esistono comunque**, a `"0.00"`, con percentuali `null`.
Nessun `NaN`, nessuno 0/0. Un piano a capitale zero **si può salvare**.

---

## POST /api/piano-smart

Ricalcola e salva. Risponde **201** con lo stesso corpo di `GET /:id`.

### Richiesta

Gli stessi campi della preview, più opzionalmente:

```json
{
  "allocations": [
    { "category": "needs",   "finalAmount": "300.00" },
    { "category": "safety",  "finalAmount": "200.00" },
    { "category": "goals",   "finalAmount": "100.00" },
    { "category": "future",  "finalAmount": "150.00" },
    { "category": "freedom", "finalAmount": "50.00"  }
  ]
}
```

**Il backend ricalcola sempre.** Qualunque `recommendedAmount` inviato dal
client viene **ignorato**: le `recommended` salvate sono quelle del motore. Del
client si accetta solo `finalAmount` (sono letti anche `amount` e
`recommendedAmount` come alias, in quest'ordine di precedenza:
`finalAmount → amount → recommendedAmount`).

Omettendo `allocations`, le finali vengono salvate uguali alle raccomandate.

Il piano nasce `status: "draft"`.

### Validazione delle allocazioni finali

Rifiutate con **400** e messaggio in italiano:

| Caso | Messaggio (estratto) |
|---|---|
| somma ≠ capitale allocabile | `La somma delle quote (…) non coincide con il capitale da distribuire (…)` |
| quota negativa | `La quota di … è negativa.` |
| importo non valido / >2 decimali | `Importo non valido per la categoria ….` |
| categoria mancante | `Categorie mancanti: ….` |
| categoria sconosciuta | `Categorie non riconosciute: ….` |
| categoria ripetuta | `Categorie ripetute: ….` |
| oltre il cap | `La quota di … (…) supera il limite di ….` |

**Il fondo di sicurezza non è un obiettivo eleggibile.** In WALLT il fondo è un
`Obiettivo` con `tipo_obiettivo: 'fondo_sicurezza'`, ma nel piano ha già la sua
categoria (`safety`) con il cap sul gap: lasciandolo anche fra gli obiettivi
riceveva denaro da due categorie, e il totale diretto al fondo poteva superare
quello che gli manca davvero (verificato: safety al cap di 3.300 € più 1.374 €
dalla quota obiettivi, verso un fondo che ne chiedeva 3.300). Non compare quindi
in `metadata.goals` e non entra in `metadata.totalRemaining`.

**I cap valgono anche sulle scelte manuali.** `goals` non può superare la somma
dei restanti degli obiettivi eleggibili; `safety` non può superare il gap del
fondo di sicurezza *quando un fondo esiste*. Senza un obiettivo
`tipo_obiettivo: 'fondo_sicurezza'`, `safety` non ha cap e il piano emette
`NO_EMERGENCY_FUND_DEFINED`: WALLT non inventa un traguardo che l'utente non ha
posto. **Il frontend deve mostrare questi limiti**, altrimenti l'utente scopre
il cap solo al rifiuto.

---

## GET /api/piano-smart

```json
{
  "data": [
    {
      "id": 12, "status": "draft", "createdAt": "2026-09-24T10:31:02.441Z",
      "incomingAmount": "800.00", "mandatoryExpenses": "0.00",
      "allocatableCapital": "800.00", "sourceType": "regalo",
      "recurring": false, "engineVersion": "smart-v1",
      "allocations": [
        { "category": "needs", "finalAmount": "83.88", "finalPercentage": 10.49 }
      ]
    }
  ],
  "total": 1
}
```

Ordinati dal più recente. Solo i piani dell'utente autenticato.

L'involucro `{ data, total }` è **solo** su questa rotta: nessun'altra risposta
ha una chiave `data` di primo livello, perché il client scarta l'involucro con
`response.data.data ?? response.data`.

## GET /api/piano-smart/:id

Come la preview, più `id`, `status`, `createdAt`, `updatedAt`, e con
`finalAmount`/`finalPercentage` reali. `404` se il piano non è dell'utente
autenticato (non `403`: un 403 confermerebbe che quell'id esiste).

## PATCH /api/piano-smart/:id

Un solo endpoint per entrambe le modifiche. Almeno uno dei due campi:

```json
{ "status": "active" }
{ "allocations": [ { "category": "needs", "finalAmount": "300.00" }, "…" ] }
{ "status": "active", "allocations": [ "…" ] }
```

Un corpo vuoto è **400**, non un no-op silenzioso. Risponde con il dettaglio
aggiornato. Le `recommended` non sono mai modificabili.

I cap usati per rivalidare sono quelli **conservati nello snapshot del piano**,
non quelli ricalcolati oggi: fra la creazione e la modifica l'utente può aver
versato sul fondo o su un obiettivo, e i cap odierni rifiuterebbero una scelta
che era legittima quando è stata fatta.

---

## contextSummary

Gli aggregati con cui il piano è stato deciso — **solo aggregati, mai una copia
dei movimenti**. Struttura (importi come stringhe, rapporti e durate come
numeri):

```
period            timezone, referenceDate, requested{from,to},
                  observed{from,to}|null, averageMonths{from,to,count}
dataQuality       historyMonthsAvailable, completeMonths, incompleteMonths,
                  firstObservedMonthPartial, missingIncomeData,
                  missingExpenseData, missingClassificationData,
                  hasSufficientHistory, registrationCompleteness
income            monthlyAverage, recurringMonthlyAverage, stability, stabilityMonths
expenses          monthlyAverage, essentialMonthlyAverage,
                  semiEssentialMonthlyAverage, discretionaryMonthlyAverage,
                  unclassifiedMonthlyAverage
cashFlow          monthlySavings, savingsRate (numero), averageMonths
liquidity         total, ordinary, specialAccounts, allocated, commitments, allocatable
emergencyFund     status, current, target, missingAmount,
                  coverageMonths (numero), targetMonths (numero), limitedHistory
debts             totalOutstanding, totalMonthlyPayments, debtPressure (numero),
                  monthlyPaymentsIncludedInCommitments (sempre false)
investments       totalValue, liquidValue, nonLiquidValue, unknownLiquidityValue,
                  countedAsAllocatableCapital (sempre false)
goals             active, completed, totalRemaining
recurring         active, paused, ended, monthlyCommitments
netWorth          assets, liabilities, total
profile           le otto fasce + unknownBands + manualAnswersUsed/Ignored
```

Tre campi sono **dichiarazioni di limite**, utili da mostrare:

- `investments.countedAsAllocatableCapital: false` — gli investimenti non
  aumentano il capitale da distribuire. Investimenti esistenti ≠ denaro nuovo.
- `debts.monthlyPaymentsIncludedInCommitments: false` — la rata mensile
  equivalente è una metrica, non un impegno accertato.
- `dataQuality.registrationCompleteness: "non_verificabile"` — vedi sopra.

`liquidity.allocatable` **può essere negativo** ed esce come `"-125.40"`: è il
segnale reale che allocato + impegnato supera i conti ordinari. Non va troncato
a zero nella UI.

---

## Reason codes

26 codici. Ognuno ha un titolo e un testo in italiano, restituiti in `reasons`.
**Nessun codice viene emesso senza il dato che lo giustifica.**

```
Vincoli forti     NEGATIVE_CASH_FLOW · LOW_EMERGENCY_BUFFER · HIGH_DEBT_PRESSURE
                  HIGH_EXPENSE_PRESSURE · ZERO_ALLOCATABLE_CAPITAL
Traguardi e cap   EMERGENCY_TARGET_REACHED · SAFETY_CAP_REACHED · GOALS_CAP_REACHED
                  NO_ACTIVE_GOALS · NO_EMERGENCY_FUND_DEFINED
Obiettivi         HIGH_PRIORITY_GOAL · GOAL_DEADLINE_APPROACHING
                  GOAL_BEHIND_SCHEDULE · GOAL_AHEAD_OF_SCHEDULE
Reddito           UNSTABLE_INCOME · STABLE_INCOME
                  HIGH_SAVINGS_CAPACITY · LOW_SAVINGS_CAPACITY
Origine           EXTRA_INCOME · RECURRING_INCOME
Spese             SPENDING_INCREASE · SPENDING_DECREASE
Limiti            INSUFFICIENT_HISTORY · SPECIAL_ACCOUNT_LIQUIDITY_EXCLUDED
                  ILLIQUID_INVESTMENTS_EXCLUDED · MANUAL_CONTEXT_USED
```

L'elenco è in ordine di priorità: è lo stesso ordine con cui `reasons` viene
troncato a 5.

Due definizioni dichiarate, perché sono scelte e non verità:

- `SPENDING_INCREASE` / `SPENDING_DECREASE`: ultimo mese civile completo
  confrontato con la media dei completi precedenti, soglia ±15%, almeno due mesi
  completi.
- `GOAL_BEHIND_SCHEDULE` / `GOAL_AHEAD_OF_SCHEDULE`: contributo mensile
  richiesto contro `monthlySavings` (dietro se lo supera, avanti se sta sotto la
  metà). Senza una data d'inizio dell'obiettivo un confronto lineare col
  progresso non è calcolabile.

---

## Errori

Formato di WALLT: `{ "error": "…" }`. I validator aggiungono
`{ "errori": [{ "campo": …, "messaggio": … }] }`; gli errori di allocazione
aggiungono `{ "errori": ["…", "…"] }` (stringhe).

**Il campo è `error`, non `message`.** `client/src/api/pianoSmart.api.js` legge
`data.error` e `data.errori`, e mostra all'utente il messaggio reale del backend
(per esempio "La somma delle quote non coincide con il capitale da
distribuire"). Prima dell'integrazione leggeva `data.message`, che su questo
namespace è sempre `undefined`: ogni errore diventava la stessa frase generica.

| Codice | Quando |
|---|---|
| 400 | validazione input, allocazioni non valide, transizione di stato non ammessa, PATCH vuoto, id non numerico |
| 401 | token assente, scaduto o malformato |
| 404 | piano inesistente **o di un altro utente** |
| 429 | limite sulla preview superato |
| 500 | errore di calcolo o di persistenza |

Non esiste un 422 in questa implementazione: la mancanza di dati **non è un
errore**. Un utente senza storico riceve un 200 con `dataConfidence:
"INSUFFICIENT"`, i warning del caso e una ripartizione prudente. Il client
classifica 400 e 422 nello stesso ramo "dati mancanti", quindi il
comportamento resta corretto.

Nessuno stack trace in produzione (`errorHandler.middleware.js`).

---

## Sicurezza

Ogni lettura e ogni scrittura filtra `where: { id, user_id: req.userId }`: mai
una `findByPk` seguita da un confronto. Un piano di un altro utente risponde
`404`, non `403`. `user_id`, `userId` o `id` inviati nel corpo sono ignorati: il
piano è sempre intestato all'utente del token.

Coperto da `server/tests/pianoSmartSecurity.test.js`: elenco, dettaglio, PATCH
allocazioni, PATCH stato, creazione con id o user_id contraffatti, e per ognuno
la verifica che il dato dell'altro utente **non** sia cambiato.

---

## Garanzie invarianti

Valide su preview, salvataggio e PATCH:

```
somma(allocazioni) == allocatableCapital     (uguaglianza esatta, in centesimi)
ogni allocazione >= 0
goals    <= somma dei restanti degli obiettivi eleggibili
safety   <= gap del fondo di sicurezza        (quando un fondo esiste)
|somma(percentuali) − 100| <= 0.1             (o tutte null a capitale zero)
investimenti e saldi esistenti NON entrano in allocatableCapital
stesso contesto + stesso input ⇒ stesso output
```

Il motore autocontrolla ogni piano che produce: una violazione lancia e diventa
un 500 con `{"error": "Errore nel calcolo del piano"}`, non una ripartizione
plausibile e sbagliata.

## Piano Smart non muove denaro

Creare, modificare o archiviare un piano **non** tocca saldi, movimenti,
trasferimenti, obiettivi, investimenti o debiti. Le uniche tabelle scritte sono
`piani_smart` e `piani_smart_allocazioni`. Le risposte manuali di contesto
valgono per il piano corrente ed entrano solo nello snapshot.

Verificato in `server/tests/pianoSmartApi.test.js` ("salvare un piano non muove
denaro", "modificare un piano non muove denaro").

## File

```
server/constants/pianoSmart.js                vocabolari condivisi
server/services/pianoSmart/money.js           centesimi, resto maggiore
server/services/pianoSmart/config.js          'smart-v1': tutti i numeri
server/services/pianoSmart/reasonCodes.js     vocabolario + priorità
server/services/pianoSmart/profile.service.js SmartFinancialProfile
server/services/pianoSmart/allocation.service.js  Allocation Engine
server/services/pianoSmart/validation.service.js  invarianti
server/services/pianoSmart/explanation.service.js reasonCode → testo
server/services/pianoSmart/readiness.service.js   cosa WALLT non sa
server/services/pianoSmart/serializer.js      stringhe decimali
server/controllers/pianoSmart.controller.js
server/routes/pianoSmart.routes.js
server/models/PianoSmart.js, PianoSmartAllocazione.js
server/migrations/20260924000031-create-piani-smart.js

client/src/utils/pianoSmart.js               vocabolario gemello del server
client/src/content/glossario.js              le cinque etichette
client/src/api/pianoSmart.api.js             trasporto + classificazione errori
client/src/stores/pianoSmart.store.js        stato UI, confronti in centesimi
client/src/views/PianoSmartView.vue          wizard, risultato, storico
client/tests/pianoSmartContratto.test.js     confronto enum client/server
```
