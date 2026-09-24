# SDD ledger — plan: docs/superpowers/plans/2026-09-24-piano-smart-frontend.md

## Integrazione finale (feature/piano-smart-v1)

Il flusso frontend è stato allineato al contratto backend reale e verificato
end-to-end nel browser (desktop 1280x900 e mobile 375x812) con backend, client
e PostgreSQL insieme.

Corretto in integrazione:

- `sourceType` e `status` viaggiavano come etichette dell'interfaccia
  (`'Regalo'`, `'completato'`): ogni chiamata tornava 400. Ora i valori API
  stanno in `client/src/utils/pianoSmart.js`, confrontati con
  `server/constants/pianoSmart.js` da un test.
- `recurring` offriva "Non lo so" (`null`), rifiutato dal backend: restano Sì/No.
- Le domande dinamiche erano lette con `question.id` (il backend espone `key`)
  e rispedite con una chiave `undefined`, rifiutata dalla validazione.
- `reasons` veniva letto come `reason.text` (il backend espone `titolo`/`testo`)
  e `contextSummary` finiva in un `<p>` come `[object Object]`.
- Senza domande da porre lo step 3 non generava nulla: pagina vuota.
- La voce era solo nel bottom sheet mobile: su desktop Piano Smart non era
  raggiungibile se non digitando l'URL.
- Lo store non veniva azzerato al logout: i dati finanziari di un utente
  restavano in memoria per il successivo sulla stessa scheda.
- Gli avvisi del backend, le spese obbligatorie suggerite e il breakdown per
  obiettivo non venivano mostrati; il capitale zero non aveva uno stato
  informativo.

Verificato nel browser: wizard, readiness, domande dinamiche, preview,
personalizzazione con totale non valido, ripristino, salvataggio, storico,
dettaglio con Recommended vs Final, cambio di stato, persistenza dopo reload,
utente nuovo, capitale zero, isolamento fra due utenti reali.
