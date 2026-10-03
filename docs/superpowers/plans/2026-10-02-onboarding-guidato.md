# Piano di implementazione della configurazione guidata

**Obiettivo:** un nuovo account può configurarsi con una bozza riprendibile e una finalizzazione transazionale.

**Architettura:** sessione versione 2 con dati finanziari in bozza, staging delle sole righe importate approvate e creazione finale nelle tabelle esistenti. Specifica: `docs/superpowers/specs/2026-10-02-onboarding-guidato-design.md`. Audit: `docs/ONBOARDING_AUDIT.md`.

**Vincoli globali:** italiano per testi e documentazione, inglese per identificatori; categorie prima dei conti; fascia d’età obbligatoria; nessun dato finanziario fittizio; nessuna scrittura su Supabase reale per i test; nessuna nuova dipendenza.

## Fasi e verifiche

- [x] 1. Migrazione additiva, modelli e CRUD bozza. Test: isolamento A/B, salvataggio/ripresa, versione e limiti, compatibilità account vecchi.
- [x] 2. Validazione canonica del payload. Test: categorie protette, personalizzate duplicate, importi/date/frequenze/chiavi conto, scenario minimale.
- [x] 3. Adattamento del classificatore e del parser per categorie e conti in bozza; staging privato dell’estratto. Test: file invalidi, categoria fuori selezione, correzione, righe ignorate, duplicati, limiti.
- [x] 4. Finalizzazione atomica delle categorie, conti, ricorrenze, debiti, obiettivi, preferenze e import. Test: errore intermedio/rollback, doppio click, due chiamate concorrenti, saldi e proprietà delle righe.
- [x] 5. Frontend: store Pinia, layout e fasi brevi, autosalvataggio, associazione rapida, import con revisione e riepilogo. Test: progresso, ripresa, errore rete, responsive e tastiera.
- [x] 6. Schermata di completamento, Home coerente, documentazione API/schema/sicurezza. Test: account semplice, completo, minimale, nuovo Google e vecchi account.
- [ ] 7. Suite completa con Node supportato, build frontend, controllo diff e revisione finale. Build, test client e suite server pertinenti sono verdi; la suite server completa resta parziale con 3 suite e 63 test falliti da triagiare.

Ogni fase di codice inizia con test che falliscono per la funzionalità mancante; la fase successiva comincia dopo il verde delle verifiche pertinenti.
