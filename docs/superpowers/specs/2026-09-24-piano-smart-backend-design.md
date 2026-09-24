# Piano Smart V1 — Backend Design

> Progetto: motore di ripartizione deterministico per una nuova somma di
> denaro. Backend, business logic, database, API, test.
> Frontend: lavoro parallelo, vedi
> `2026-09-24-piano-smart-frontend-design.md`. Questo documento è la fonte
> del contratto API; quel documento vi si adegua per nomi, enum e DTO.

## Obiettivo

Ricevuta una nuova somma (stipendio, bonus, regalo, rimborso, vendita,
entrata occasionale), Piano Smart propone una ripartizione fra cinque
categorie — `needs`, `safety`, `goals`, `future`, `freedom` — a partire dallo
stato finanziario **già registrato in WALLT**, non da percentuali fisse.

Non è un 50/30/20. Non è un consulente. Non muove denaro.

## Confini non negoziabili

1. **Nessun calcolo finanziario nuovo.** Ogni metrica viene da
   `getFinancialContext` e dai servizi di dominio che esso compone. Il motore
   mappa il contesto in fasce e pesi: non ricalcola medie, stabilità,
   copertura, pressione debitoria o liquidità.
2. **Nessun LLM.** V1 è interamente deterministico. Le spiegazioni sono una
   tabella `reasonCode → testo`. Un'eventuale AI futura potrà solo riformulare
   quel testo: mai cambiare numeri, codici o priorità.
3. **Nessun movimento di denaro.** Creare o salvare un piano non tocca saldi,
   movimenti, trasferimenti, obiettivi, investimenti, debiti. Piano Smart V1 è
   solo pianificazione.
4. **Determinismo.** Stesso contesto + stesso input ⇒ stesso output, byte per
   byte. È la proprietà che rende il motore testabile e spiegabile.
5. **Nessun dato inventato.** Una metrica assente resta assente: non diventa
   uno zero né un valore "medio". Un modificatore la cui metrica è `null` non
   viene applicato, e l'assenza abbassa `dataConfidence`.

## La catena

```
getFinancialContext(userId)                      ← esistente, non duplicato
  → smartFinancialProfile.service.js             puro: contesto → 8 fasce
  → pianoSmartReadiness.service.js               cosa WALLT non sa
  → pianoSmartConfig.js                          TUTTI i numeri, 'smart-v1'
  → pianoSmartAllocation.service.js              puro: centesimi → centesimi
  → pianoSmartValidation.service.js              invarianti, lancia se violati
  → pianoSmartExplanation.service.js             reasonCode → testo italiano
  → pianoSmart.controller.js / routes / validation
  → PianoSmart + PianoSmartAllocazione (1 migration)
```

I service del motore non conoscono Sequelize né Express: ricevono oggetti,
restituiscono oggetti. È questo che rende la matrice di scenari dei test
eseguibile senza database (girano anche in `npm run test:unit`).

## Riuso: dove vive già ogni metrica

| Serve | Origine reale |
|---|---|
| stabilità reddito, CV, mesi di stabilità | `income.stability` (`entrate.service`) |
| cash flow, tasso di risparmio | `cashFlow.monthlySavings`, `.savingsRate` |
| spese essenziali mensili | `expenses.byNecessity.essential.monthlyAverage` (`essenzialita.service`) |
| copertura fondo sicurezza e gap | `emergencyFund.coverageMonths`, `.missingAmount` (`fondoSicurezza.service`) |
| obiettivi: restante, priorità, scadenza | `goals[]` (`obiettiviStato.service`) |
| pressione debitoria | `debts.debtPressure` (`debiti.service`) |
| investimenti illiquidi | `investments.nonLiquidValue`, `.unknownLiquidityValue` |
| conti speciali (scommesse) | `liquidity.specialAccounts`, `.allocatable` (`liquidita.service`) |
| qualità dati e finestre | `dataQuality`, `period.{requested,observed,averageMonths}` (`finestraMesi.service`) |

Unica modifica additiva a `financialContext.service.js`: `goals[]` espone
anche `nome`, necessario per il breakdown per obiettivo. Nessun'altra
semantica cambia.

## Money safety

Il motore lavora **esclusivamente in centesimi interi**. Gli euro esistono
solo al confine di serializzazione.

- Ingresso: stringa o numero → validazione `^\d{1,10}([.,]\d{1,2})?$` →
  centesimi interi. Più di due decimali è un errore, non un arrotondamento
  silenzioso.
- Uscita API: **stringhe decimali** (`"800.00"`) per ogni importo del
  namespace Piano Smart, `contextSummary` compreso. Regola unica, documentata,
  senza eccezioni: il client non fa aritmetica float sul denaro e può
  verificare da sé l'invariante della somma.
- Percentuali: numeri con due decimali, `null` quando il capitale allocabile è
  zero (una percentuale di zero non significa niente).

## SmartFinancialProfile

Mappatura pura, nessuna query, nessuna formula nuova. Otto fasce, ognuna con
il suo driver dichiarato e la possibilità di essere ignota.

| Fascia | Valori | Driver |
|---|---|---|
| `incomeStability` | LOW / MEDIUM / HIGH | `income.stability` |
| `expensePressure` | LOW / MEDIUM / HIGH | spese essenziali ÷ reddito ricorrente |
| `savingsCapacity` | NEGATIVE / LOW / MEDIUM / HIGH | `monthlySavings`, `savingsRate` |
| `emergencyCoverage` | CRITICAL / LOW / ADEQUATE / STRONG | `coverageMonths` vs `targetMonths` |
| `goalPressure` | NONE / LOW / MEDIUM / HIGH | stato peggiore fra gli obiettivi eleggibili |
| `debtPressure` | NONE / LOW / MEDIUM / HIGH | `debts.debtPressure` |
| `financialFlexibility` | LOW / MEDIUM / HIGH | `liquidity.allocatable` in mesi di spese essenziali |
| `dataConfidence` | INSUFFICIENT / LIMITED / GOOD | mesi completi, `hasSufficientHistory`, driver nulli |

`incomeStability` merita una nota: `'insufficiente'` e `'nessuna_entrata'`
diventano MEDIUM, **non** HIGH — non poter dimostrare la stabilità non è
stabilità. La fascia porta con sé `unknown: true` e abbassa `dataConfidence`.

## Allocation Engine

Nove passi, tutti in centesimi, tutti con i numeri in `pianoSmartConfig.js`.
Zero costanti sparse nel codice.

1. `allocatable = max(incoming − mandatory, 0)`.
2. Pesi base: `needs 25, safety 25, goals 20, future 20, freedom 10`. **Non
   sono percentuali finali**: sono il punto di partenza.
3. Azzeramenti di eleggibilità: `goals → 0` se nessun obiettivo non completato
   ha un restante > 0.
4. Modificatori **moltiplicativi**, una tabella per driver (copertura
   emergenza, cash flow, stabilità reddito, pressione spese, pressione
   debitoria, tipo entrata, pressione obiettivi, confidenza dati). Ogni
   fattore applicato emette il suo reason code: la spiegazione è *derivata*
   dalla matematica, non scritta a fianco.
5. Un modificatore con metrica `null` **non si applica**. L'assenza abbassa
   `dataConfidence`, non diventa un neutro dichiarato.
6. Banda `freedom`: 5–15% in condizioni normali; il minimo scende a 2% con
   cash flow negativo, emergenza critica o pressione debitoria alta. Mai 0
   senza un driver concreto. La banda si applica sulle quote normalizzate, poi
   le altre quattro categorie vengono riscalate proporzionalmente.
7. Da quote a centesimi con **ripartizione al resto maggiore** (Hamilton),
   spareggio sull'ordine fisso delle categorie. È questo che rende
   `sum == allocatable` esatto e non approssimato.
8. **Cap + redistribuzione**:
   - `goals ≤ Σ restante degli obiettivi eleggibili`;
   - `safety ≤ gap del fondo sicurezza`, **solo se un obiettivo
     `fondo_sicurezza` esiste**. Senza fondo definito `safety` resta senza
     cap e viene emesso `NO_EMERGENCY_FUND_DEFINED`: nessun target inventato,
     coerente con `fondoSicurezza.service.js` che risponde `'assente'` e non
     zero.
   - L'eccedenza si redistribuisce fra le categorie ancora eleggibili in
     proporzione al peso, si ri-applicano i cap, massimo 5 iterazioni.
     Destinatario di ultima istanza `freedom`, poi `needs`. Terminazione
     garantita: solo `goals` e `safety` hanno cap.
9. Breakdown obiettivi: punteggio `priorità × urgenza × restante`, cap per
   obiettivo al restante, resto ai soli obiettivi con capacità residua in
   ordine (punteggio desc, id asc).

### Capitale zero

`incoming ≤ mandatory` ⇒ `allocatable = 0`, `status: 'capitale_zero'`, cinque
allocazioni a `"0.00"`, percentuali `null`, reason code
`ZERO_ALLOCATABLE_CAPITAL` e un warning. Nessuna percentuale senza senso,
nessun NaN. Il frontend decide come mostrarlo.

## Invarianti (validati, non sperati)

`pianoSmartValidation.service.js` li verifica su ogni preview, ogni
salvataggio e ogni PATCH:

- `Σ allocazioni == allocatable` (in centesimi, uguaglianza esatta);
- nessuna allocazione negativa;
- `goals ≤ Σ restante obiettivi`;
- `safety ≤ gap` quando il cap è applicabile;
- `|Σ percentuali − 100| ≤ 0.1` (o tutte `null` a capitale zero);
- investimenti esistenti mai sommati al capitale allocabile.

Una violazione è un errore del motore, non dell'utente: lancia e viene
registrata, non corretta in silenzio.

## Reason codes

I venti richiesti più sei aggiunti dove servivano: `NO_ACTIVE_GOALS`,
`NO_EMERGENCY_FUND_DEFINED`, `ZERO_ALLOCATABLE_CAPITAL`,
`GOALS_CAP_REACHED`, `SAFETY_CAP_REACHED`, `MANUAL_CONTEXT_USED`.

Nessun codice viene emesso senza il dato che lo giustifica. Due definizioni
che vanno dichiarate perché sono scelte, non verità:

- `SPENDING_INCREASE` / `SPENDING_DECREASE`: ultimo mese completo confrontato
  con la media dei mesi completi precedenti, soglie ±15%, almeno due mesi
  completi. Usa `expenses.history`, nessuna query nuova.
- `GOAL_BEHIND_SCHEDULE` / `GOAL_AHEAD_OF_SCHEDULE`: contributo mensile
  richiesto confrontato con `monthlySavings` (dietro se lo supera, avanti se
  sta sotto la metà). Serve `monthlySavings` noto e positivo. Senza data di
  inizio dell'obiettivo un confronto lineare col progresso non è calcolabile:
  questa è la definizione dichiarata, non un'approssimazione taciuta.

## Readiness — chiedere solo ciò che WALLT non sa

`GET /api/piano-smart/readiness` restituisce `dataQuality`, `missingFields`,
`questions[]`, `warnings[]`, `suggestedMandatoryExpenses`, `contextSummary`.

Una domanda esiste **solo** se il contesto non ha il dato. Quattro possibili:
`monthly_income_average`, `essential_monthly_expenses`, `liquid_savings`,
`upcoming_obligations`.

Le risposte manuali valgono per il piano corrente, entrano nel
`context_snapshot`, e **non scrivono nulla** su movimenti, conti, debiti,
investimenti, obiettivi. Riempiono un driver `null`; se il dato è osservato,
l'osservato vince e un warning dichiara che la risposta manuale è stata
ignorata.

`suggestedMandatoryExpenses` è supportato solo quando esiste un numero reale
dietro: `liquidity.commitments`, cioè le ricorrenze attive del periodo
corrente non ancora addebitate. Le rate dei debiti **non** vi entrano — lo
schema non collega debito e ricorrenza, sommarle significherebbe contare due
volte lo stesso euro (vedi `debiti.service.js`). Un valore suggerito non
viene mai sottratto d'ufficio: lo conferma l'utente.

## Database — una migration, due tabelle

`piani_smart`: `id`, `user_id` (FK users CASCADE), `incoming_amount`,
`mandatory_expenses`, `allocatable_capital`, `recommended_total`
(DECIMAL(12,2)), `source_type` STRING(30), `source_recurring` BOOL,
`engine_version` STRING(20), `context_snapshot` JSONB, `reason_codes` JSONB,
`status` STRING(20), timestamps. CHECK su `source_type` e `status`, indici su
`(user_id, created_at)` e `(user_id, status)`.

`source_type` riusa `NATURE_ENTRATA` di `entrate.service.js`: il vocabolario
delle nature di entrata già esistente copre stipendio, pensione, compenso,
bonus, regalo, rimborso, vendita, altro. Un vocabolario, non due.

`piani_smart_allocazioni`: `id`, `plan_id` (FK CASCADE), `category`,
`recommended_amount`, `final_amount`, `recommended_percentage`,
`final_percentage`, `metadata` JSONB, `reason_codes` JSONB, timestamps,
**UNIQUE(plan_id, category)**.

Tabella separata e non JSONB per tre ragioni concrete: la UNIQUE rende
"esattamente queste cinque categorie, senza duplicati" una garanzia del
database e non una convenzione applicativa; il PATCH sulle allocazioni finali
è una scrittura per categoria; `sum(final_amount)` è verificabile in SQL.

Entrambe le tabelle ricevono il blocco di hardening RLS introdotto da
`20260917000024-create-debiti.js` ed entrano nella lista TABLES di
`tests/setup.js`.

`status`: `draft`, `active`, `completed`, `archived`. Nessun DELETE:
l'archiviazione è una transizione di stato, così il piano resta verificabile.

## Contratto API

Sette endpoint sotto `/api/piano-smart`, tutti dietro `authMiddleware`.

| Metodo | Path | Scopo |
|---|---|---|
| GET | `/readiness` | cosa manca, domande, spese obbligatorie suggerite |
| POST | `/preview` | calcola, non salva niente |
| POST | `/` | ricalcola lato server e salva |
| GET | `/` | piani dell'utente autenticato |
| GET | `/:id` | dettaglio, solo proprietario |
| PATCH | `/:id` | `{ status }` e/o `{ allocations }` finali |
| DELETE | — | non previsto |

### Allineamento col client già committato

Il frontend ha già scritto `client/src/api/pianoSmart.api.js` e
`pianoSmart.store.js` sul branch `feature/piano-smart-frontend` (non ancora in
`main`). Il contratto si adegua a quel codice invece di costringerlo a cambiare:

- chiavi di richiesta `amount`, `sourceType`, `recurring`,
  `mandatoryExpenses`, `manualContextAnswers`, `allocations`;
- un solo `PATCH /api/piano-smart/:id` (non un sotto-path `/stato`), perché
  lo store chiama `updatePlan(id, { status })`;
- `unwrap` del client legge `data.data ?? data`: la lista risponde
  `{ data: [...], total }`, e nessun altro corpo ha una chiave `data` di primo
  livello;
- il client classifica 400 e 422 come "dati mancanti": la validazione
  risponde 400, i dati insufficienti 422.

`POST /` **ricalcola sempre** e ignora qualunque `recommendedAmount` arrivato
dal browser. Accetta solo le allocazioni `final`, e le valida contro gli
invarianti. `recommended` e `final` restano distinti a database.

### Errori

Formato esistente di WALLT: `{ error: "..." }`, con `errori[]` dai validator.
Distinguibili: 400 validazione, 401 non autenticato, 403/404 proprietà, 422
dati insufficienti, 500 errore di calcolo. Mai stack trace in produzione
(`errorHandler.middleware.js` già lo garantisce).

## Sicurezza

Ogni lettura e ogni scrittura filtra `where: { id, user_id: req.userId }`:
mai una fetch seguita da un confronto. Coperto da test cross-user espliciti su
lista, dettaglio, PATCH allocazioni e PATCH stato.

`pianoSmartLimiter` dedicato su `/preview`: ogni chiamata espande l'intero
contesto finanziario (molte query), e il limite globale di 1200/15min non
protegge da un loop di preview.

## Test

Sei suite nuove. Le prime quattro non toccano il database e vengono aggiunte
anche a `jest.unit.config.js`.

| Suite | Copre |
|---|---|
| `pianoSmartProfile` | le otto fasce, driver nulli, ignoto ≠ medio |
| `pianoSmartEngine` | importi, emergenza, reddito, cash flow, obiettivi, debiti, investimenti, conti speciali, qualità dati, redistribuzione, cap multipli |
| `pianoSmartInvariants` | property-like: contesti generati × importi, somma, non negatività, percentuali, cap, determinismo |
| `pianoSmartScenari` | A/B/C come asserzioni **relative**, nessun centesimo hardcoded |
| `pianoSmartApi` | readiness, preview, save, list, detail, patch, capitale zero |
| `pianoSmartSecurity` | cross-user su lista, dettaglio, patch allocazioni, patch stato |

Gli scenari obbligatori si verificano per *ordinamento*, non per valore: B più
prudente di A (needs+safety relativamente maggiori, future+freedom minori), C
più espansivo di A su goals/future/freedom e minore su safety.

## Fuori scope

Chat finanziaria, Audit, Piano Patrimoniale, Cash Flow Optimizer, Monte Carlo,
forecasting, "posso permettermelo?", ETF/azioni/crypto, open banking,
trasferimenti automatici, notifiche, redesign Home, ML sulle scelte utente.

## Definition of done

FinancialContext realmente usato; Profile presente; motore deterministico con
cinque categorie, cap, redistribuzione e rounding sicuri; reason code reali;
validazione matematica che lancia; readiness/preview/save/list/detail/patch
funzionanti; `recommended` e `final` distinti; snapshot e `engineVersion`
salvati; protezione cross-user testata; nuovi utenti supportati via readiness;
test verdi; nessuna regressione sulla Financial Foundation.
