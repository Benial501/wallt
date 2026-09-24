# Piano Smart V2 — Specifica di pianificazione finanziaria

## Obiettivo

Evolvere Piano Smart da ripartitore di una nuova entrata a sistema deterministico di pianificazione finanziaria personale. V2 deve aiutare l'utente a capire:

1. quanto capitale è realmente distribuibile;
2. quale effetto può avere ogni scelta;
3. quali azioni preparatorie può compiere.

Il backend resta l'unica fonte di verità per contesto finanziario, calcoli, scenari, proiezioni e azioni. Piano Smart non è consulenza finanziaria, non promette previsioni certe e non modifica saldi, movimenti o altre entità finanziarie.

## Decisioni confermate

- La riserva minima può essere stimata prudentemente anche quando l'utente non ha creato un obiettivo fondo sicurezza. La risposta deve distinguere sempre tra valore osservato, stimato e manuale.
- Un'entrata ricorrente proietta il mese successivo; un'entrata occasionale resta una tantum.
- Senza tasso d'interesse o altri dati sufficienti, il confronto sui debiti viene mostrato ma non ordina automaticamente la priorità.
- Le azioni V2 sono preparatorie. Un futuro flusso separato potrà eseguire operazioni reali solo dopo conferma esplicita; V2 non lo implementa.
- V1 resta compatibile. V2 usa `smart-v2` e non converte automaticamente i piani già salvati.

## Confini e compatibilità

V1 resta invariato nei propri endpoint, serializer e snapshot. I piani V1 continuano a essere leggibili e modificabili secondo il contratto esistente; quando mancano scenari, proiezioni o azioni, la UI mostra che non sono disponibili invece di ricostruirli.

V2 aggiunge un nuovo contratto sotto `/api/piano-smart/v2` e riusa `getFinancialContext`, i servizi finanziari esistenti, la validazione in centesimi e l'isolamento per `user_id`. Nessuna dipendenza esterna è necessaria.

## Modello di dominio

### Contesto di pianificazione

Un servizio dedicato adatta il `FinancialContext` senza ricalcolare le metriche di dominio e produce:

- importo ricevuto;
- natura e ricorrenza dell'entrata;
- impegni obbligatori inseriti o suggeriti;
- riserva minima consigliata;
- capitale distribuibile;
- capitale libero minimo/sostenibile;
- situazione finanziaria di partenza;
- dati osservati, stimati e manuali;
- mesi completi utilizzati, primo mese parziale escluso e limiti del dato.

Formula dichiarata:

```text
capitale distribuibile = max(importo ricevuto - impegni obbligatori - riserva minima, 0)
```

La riserva prudenziale senza fondo configurato è una stima del motore, non un nuovo saldo e non un obiettivo creato automaticamente. Se non è sostenibile calcolarla, vale `null` con motivo esplicito e il capitale distribuibile viene calcolato senza sottrarla, con un avviso di affidabilità.

### Scenari

Ogni scenario usa lo stesso capitale e gli stessi cap, ma pesi deterministici distinti:

- `prudente`: obblighi, riserva, liquidità e riduzione del rischio;
- `bilanciato`: equilibrio tra sicurezza, obiettivi, futuro e libertà;
- `ambizioso`: obiettivi, debiti e futuro, solo dopo il rispetto della sicurezza minima.

Ogni allocazione conserva categoria, importo, percentuale, motivazioni, destinazione concreta e metadati dell'eventuale obiettivo/debito coinvolto. Il bilanciato è pre-selezionato, mai imposto.

### Proiezioni

Per ogni scenario vengono calcolati gli orizzonti 3, 6 e 12 mesi. Le proiezioni sono lineari, deterministiche e basate sul contesto corrente:

- entrata ricorrente: applicata dal mese successivo;
- entrata occasionale: applicata una sola volta;
- spese e rate: usano le metriche osservate disponibili;
- obiettivi: avanzano con la quota assegnata e il contributo mensile noto;
- debiti: mostrano il residuo stimabile solo con dati sufficienti.

Ogni metrica può avere `value: null`, `status: "non_stimabile"` e una ragione precisa. Nessuna proiezione usa simulazioni probabilistiche.

### Obiettivi e fondo sicurezza

Il fondo sicurezza resta una destinazione separata dagli obiettivi generici e può ricevere denaro una sola volta per scenario. Gli obiettivi generici espongono nome, residuo, priorità, stato temporale e tempo stimato quando calcolabile.

Il breakdown della quota `goals` è prodotto dal backend e limita ogni obiettivo al proprio residuo. Le destinazioni operative indicano l'obiettivo specifico e l'effetto di una quota maggiore o minore.

### Debiti

Il contesto espone debito residuo, rate mensili e pressione sul reddito. Il motore confronta sicurezza, obiettivi e rimborso. Un debito viene ordinato come più urgente/costoso solo se il tasso o un dato equivalente è disponibile; in caso contrario il confronto resta informativo e dichiara il limite.

### Azioni

Il motore genera al massimo cinque azioni ordinate per priorità. Ogni azione contiene titolo, importo, destinazione, motivo, rischio se ignorata e stato iniziale `da_fare`. Le azioni sono preparatorie: nessun endpoint V2 esegue un movimento finanziario.

## Snapshot e persistenza

`PianoSmart` mantiene i campi V1 e aggiunge una struttura V2 versionata in `context_snapshot` oppure in un campo JSONB dedicato, preferibilmente `planning_snapshot`, per non alterare il significato storico di V1.

La struttura include:

```json
{
  "engineVersion": "smart-v2",
  "input": {},
  "capital": {},
  "financialSituation": {},
  "dataQuality": {},
  "scenarios": [],
  "selectedScenario": "balanced",
  "recommendedAllocations": [],
  "finalAllocations": [],
  "projections": {},
  "actions": [],
  "warnings": [],
  "confidence": "LIMITED"
}
```

Le azioni persistono in `piani_smart_azioni` per consentire aggiornamenti atomici e isolamento sicuro:

- `id`, `plan_id`, `user_id`;
- `action_key`, `title`, `amount`;
- `destination_type`, `destination_id`;
- `reason`, `risk_if_ignored`, `priority`;
- `status` (`da_fare`, `completata`, `ignorata`);
- timestamps.

Gli importi persistono come DECIMAL e viaggiano dall'API come stringhe decimali. Le somme vengono validate in centesimi interi.

## API V2

- `POST /api/piano-smart/v2/preview`: genera contesto, capitale, scenari, proiezioni e azioni senza salvare.
- `POST /api/piano-smart/v2`: ricalcola lato server e salva piano e azioni, senza modificare dati finanziari.
- `GET /api/piano-smart/v2/:id/scenarios`: recupera gli scenari salvati.
- `POST /api/piano-smart/v2/:id/scenario`: aggiorna scenario e allocazioni finali dopo validazione server-side.
- `GET /api/piano-smart/v2/:id/projection`: recupera proiezioni salvate.
- `GET /api/piano-smart/v2/:id/actions`: recupera azioni del piano.
- `PATCH /api/piano-smart/v2/:id/actions/:actionId`: aggiorna lo stato di un'azione.

Ogni rotta richiede JWT e filtra sempre per `user_id`. Il flusso futuro “conferma ed esegui” sarà un namespace separato e non viene anticipato da questi endpoint.

## Frontend

La view e lo store V2 riusano il trasporto esistente ma non replicano la logica finanziaria. Il risultato viene organizzato in:

1. situazione finanziaria;
2. capitale disponibile;
3. scenari;
4. proiezione;
5. allocazioni;
6. obiettivi e debiti;
7. cosa fare ora;
8. dati e limiti.

Il confronto tra proposta e scelta utente mostra differenze per categoria e avvisi generati dal backend. Il layout mobile evita tabelle larghe e usa card/stack verticali.

## Validazione e sicurezza

Il motore verifica:

- somme esatte in centesimi;
- importi non negativi;
- capitale distribuibile coerente;
- nessuna doppia allocazione del fondo sicurezza;
- cap degli obiettivi e dei debiti;
- massimo cinque azioni;
- scenario appartenente all'istantanea salvata;
- transizioni valide delle azioni;
- isolamento completo tra utenti.

Preview e salvataggio non modificano saldi, movimenti, conti, debiti, obiettivi o investimenti.

## Piano di test

Saranno aggiunti test puri per capitale, riserva, ricorrenza, scenari, obiettivi, fondo sicurezza, debiti, proiezioni, dati insufficienti, azioni e invarianti. I test API copriranno autenticazione, isolamento, compatibilità V1, assenza di scritture finanziarie e aggiornamento azioni. I test frontend copriranno stati principali, confronto, `non_stimabile`, piani V1, responsive markup e build.

## Fuori perimetro

- esecuzione automatica di movimenti;
- collegamento bancario;
- consulenza professionale;
- simulazioni probabilistiche o Monte Carlo;
- nuova AI per decidere numeri o priorità;
- migrazione automatica dei piani V1;
- pagamento o gestione avanzata dei debiti non supportata dai dati presenti.
