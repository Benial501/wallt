# Piano Smart V2 — Contratto API

Le rotte V2 sono locali al namespace `/api/piano-smart/v2`, richiedono JWT e non modificano saldi o movimenti.

## Preview

`POST /api/piano-smart/v2/preview`

Body: `amount`, `mandatoryExpenses`, `sourceType`, `recurring`.

La risposta contiene `engineVersion: "smart-v2"`, capitale ricevuto/obbligatorio/riserva/distribuibile, situazione finanziaria, qualità dati, tre scenari, proiezioni a 3/6/12 mesi, azioni preparatorie, avvisi e affidabilità.

Gli importi sono stringhe decimali. I valori non stimabili hanno stato `non_stimabile` e una motivazione.

## Salvataggio

`POST /api/piano-smart/v2`

Ricalcola il piano lato server e salva snapshot e azioni in una transazione. Non crea movimenti finanziari.

## Azioni

- `GET /api/piano-smart/v2/:id/actions`
- `PATCH /api/piano-smart/v2/:id/actions/:actionId` con `{ "status": "completata" | "ignorata" }`

Le azioni appartengono sempre all'utente autenticato e partono da `da_fare`.

I piani `smart-v1` restano gestiti dal contratto V1 e non vengono convertiti automaticamente.
