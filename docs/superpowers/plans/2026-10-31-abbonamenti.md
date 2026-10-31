# Abbonamenti: piano di implementazione

> **Per chi esegue:** usare superpowers:executing-plans. I passi usano le caselle `- [ ]`.

**Obiettivo:** aggiungere a Programmate una scheda Abbonamenti di sola lettura rispetto ai conti, con riconoscimento dalle transazioni, icone, conti annuali e totali.

**Architettura:** una tabella `abbonamenti` e un service unico. A ogni `GET /api/abbonamenti` una funzione pura confronta movimenti e righe salvate e produce le scritture necessarie, tutte idempotenti. I conti sono una funzione pura in centesimi interi, duplicata nel client e sorvegliata da un test di contratto.

**Tecnologie:** Express 5, Sequelize 6, PostgreSQL, Vue 3, Pinia, Jest, `node:test`.

**Documento di progetto:** `docs/superpowers/specs/2026-10-31-abbonamenti-design.md`

## Vincoli generali

- Mai scrivere su `conti`, `movimenti` o qualunque altra tabella finanziaria.
- Nessuna dipendenza npm nuova.
- Testi, commenti e commit in italiano; identificatori in inglese.
- Testo informativo a 14px minimo (`--text-xs`).
- Ogni query filtra per `user_id`.
- Migrazione con RLS abilitata e privilegi revocati ad `anon`/`authenticated`.
- `git add` solo con percorsi espliciti. Nessun push senza richiesta del proprietario.

## Punti di attenzione

Casi che il documento implica e che vanno fissati dal test del task indicato:

1. Movimento con categoria `abbonamenti` e descrizione vuota: abbonamento chiamato come la categoria, nessun errore (Task 3).
2. `costo` che arriva da Sequelize come stringa («19.99»): nessun errore di arrotondamento (Task 1).
3. Programmazione storica con frequenza `settimanale`, `giornaliera` o `una_tantum`: ignorata senza errori (Task 3).
4. Abbonamento a tempo iniziato il 31 gennaio per un mese: finisce il 28 o 29 febbraio, non il 3 marzo (Task 3).
5. Addebito con la stessa data dell'annullamento: non riattiva l'abbonamento (Task 3).

---

### Task 1: Vocabolario e conti

**File:**
- Crea: `server/constants/abbonamenti.js`, `server/utils/abbonamentiCosti.js`, `client/src/utils/abbonamenti.js`
- Test: `server/tests/abbonamentiCosti.test.js` (aggiunto a `jest.unit.config.js`), `client/tests/abbonamentiContratto.test.js`

**Interfacce prodotte:**
- `constants/abbonamenti.js`, **senza `require`**: `CATEGORIE_ABBONAMENTO`, `CATEGORIE_DA_DESCRIZIONE` (`['da_verificare', 'altro_uscita']`), `PERIODI_MESI` (`[1, 3, 6, 12]`), `DURATA_MESI_MAX` (120), `MESI_FINESTRA_LETTURA` (3), `STATI` (`ATTIVO`, `ANNULLATO`, `ESCLUSO`), `ORIGINI` (`MANUALE`, `RILEVATO`), `GRUPPI_SERVIZI`, `CATALOGO_SERVIZI` (`[{ id, nome, gruppo, alias }]`, alias specifici prima), `ICONE_GENERICHE` (`palestra`, `telefono`, `giornali`, `altro`).
- `utils/abbonamentiCosti.js`, senza `require`:
  - `aCentesimi(valore) → intero`
  - `calcolaCosti({ costo, periodo_mesi, durata_mesi }) → { al_mese, in_un_anno, in_totale, peso_annuo }` in centesimi, `in_totale` è `null` senza scadenza
  - `calcolaTotali(voci) → { al_mese, all_anno, se_tutti_12_mesi }` in centesimi, `se_tutti_12_mesi` è `null` senza abbonamenti a tempo
- `client/src/utils/abbonamenti.js`: gli stessi nomi del vocabolario (senza `alias`), `calcolaCosti`, `etichettaPeriodo(periodo_mesi)`.

- [ ] **Passo 1: scrivere i test.** In `abbonamentiCosti.test.js` una riga per ogni caso della tabella del documento, più il totale di esempio:

```js
const voci = [
  { costo: '13.99', periodo_mesi: 1, durata_mesi: null },
  { costo: '49.90', periodo_mesi: 12, durata_mesi: null },
  { costo: '23.00', periodo_mesi: 1, durata_mesi: null },
  { costo: '18.00', periodo_mesi: 1, durata_mesi: null },
  { costo: '10.99', periodo_mesi: 1, durata_mesi: 3 },
];
expect(calcolaTotali(voci)).toEqual({ al_mese: 7014, all_anno: 74275, se_tutti_12_mesi: 84166 });
expect(calcolaTotali(voci.slice(0, 4)).se_tutti_12_mesi).toBeNull();
expect(aCentesimi('19.99')).toBe(1999);
```

In `abbonamentiContratto.test.js`, sul modello di `fondoEmergenzaContratto.test.js`: vocabolario identico sui due lati, id e nome del catalogo identici, `calcolaCosti` identico su tutte le combinazioni di tre costi, dei quattro periodi e di durata `null`, 3, 7, 24, e il service che legge il vocabolario dal modulo condiviso.

- [ ] **Passo 2: eseguire e verificare che falliscano.** `cd server && npx jest --config jest.unit.config.js tests/abbonamentiCosti.test.js`, `cd client && node --test tests/abbonamentiContratto.test.js`. Atteso: modulo non trovato.

- [ ] **Passo 3: implementare.** `in_un_anno = costo × 12 / periodo` è sempre intero. `al_mese = round(in_un_anno / 12)`. Il totale al mese è `round(Σ in_un_anno / 12)`, non la somma dei valori arrotondati.

- [ ] **Passo 4: eseguire e verificare che passino.**

- [ ] **Passo 5: commit.**

### Task 2: Tabella, modello e dati dell'utente

**File:**
- Crea: `server/migrations/20261031000053-create-abbonamenti.js`, `server/models/Abbonamento.js`
- Modifica: `server/models/index.js`, `server/tests/setup.js` (tabella nell'elenco del `TRUNCATE`), `server/services/accountReset.service.js`, `server/controllers/impostazioni.controller.js` (`esportaDati`)
- Test: `server/tests/abbonamentiDatiUtente.test.js`

**Interfacce prodotte:** modello `Abbonamento` con `user_id`, `servizio_id`, `chiave`, `ordine`, `nome`, `icona`, `costo`, `periodo_mesi`, `durata_mesi`, `data_inizio`, `stato`, `origine`, `da_verificare`, `riattivato_da_addebito`, `annullato_il`, `ultimo_addebito_data`, `ultimo_addebito_importo`, `modificato_utente_il`, `movimento_ricorrente_id`.

Vincoli: `UNIQUE (user_id, chiave, ordine)`, che è il vincolo anti-doppioni; CHECK su `stato`, `origine`, `periodo_mesi`; `user_id` con `ON DELETE CASCADE`; `movimento_ricorrente_id` intero senza chiave esterna.

- [ ] **Passo 1: scrivere i test.** `deleteAllUserData` cancella tutte le righe dell'utente e non quelle di altri. `deleteAllTransactions` cancella le righe `rilevato` con `modificato_utente_il` nullo, conserva le altre azzerando `ultimo_addebito_*`. `esportaDati` restituisce `abbonamenti` del solo utente.
- [ ] **Passo 2: eseguire e verificare che falliscano.**
- [ ] **Passo 3: implementare migrazione, modello e le tre modifiche.** La migrazione segue `20261002000046-create-onboarding-sessions.js`.
- [ ] **Passo 4: eseguire, insieme a `migrazioniReali.test.js`, e verificare che passino.**
- [ ] **Passo 5: commit.**

### Task 3: Riconoscimento, service e API

**File:**
- Crea: `server/services/abbonamentiRilevamento.js`, `server/services/abbonamenti.service.js`, `server/controllers/abbonamenti.controller.js`, `server/routes/abbonamenti.routes.js`
- Modifica: `server/middleware/validation.middleware.js`, `server/app.js`
- Test: `server/tests/abbonamentiRilevamento.test.js` (puro, in `jest.unit.config.js`), `server/tests/abbonamenti.test.js`

**Interfacce consumate:** Task 1 e Task 2. `giornoLocale(now, 'Europe/Rome')` per la data di oggi. `MerchantNormalizer` per le descrizioni fuori catalogo.

**Interfacce prodotte:**
- `abbonamentiRilevamento.js`, puro:
  - `identificaServizio(descrizione) → voce del catalogo | null`
  - `descriviMovimento({ categoria, descrizione }) → { chiave, servizio_id, nome, icona } | null`
  - `aggiungiMesi(dataIso, mesi) → dataIso`, con fine mese limitata
  - `pianifica({ movimenti, regole, righe, oggi }) → { crea: [...], aggiorna: [{ id, campi }] }`
- `abbonamenti.service.js`: `elenco(userId) → { attivi, non_attivi, totali }`, `crea(userId, dati)`, `modifica(userId, id, dati)`, `annulla(userId, id)`, `escludi(userId, id)`, `ripristina(userId, id)`.
- Ogni voce restituita: i campi del modello utili al client, più `stato_effettivo` (`attivo`, `annullato`, `finito`, `escluso`), `data_fine` e `costi` in euro. `totali` in euro. Attivi ordinati per `in_un_anno` decrescente.
- Rotte: `GET /api/abbonamenti`, `POST /`, `PUT /:id`, `PATCH /:id/annulla`, `PATCH /:id/escludi`, `PATCH /:id/ripristina`, tutte con `authMiddleware`. Risposte: `{ abbonamento }` per le scritture, 404 se la riga non è dell'utente, 422 per `escludi` su una riga `manuale`.

Regole di `pianifica` per ogni `chiave`:

1. Si raggruppano gli addebiti in flussi. Il numero di flussi è il massimo di importi distinti in uno stesso mese. Con un solo flusso, tutti gli addebiti vi appartengono. Con più flussi, ogni addebito va al flusso con l'importo più vicino.
2. Ogni flusso si abbina a una riga libera della chiave, in quest'ordine: costo uguale, qualunque stato; unica riga della chiave, se non è esclusa; costo più vicino fra le non escluse, con differenza fino al 25%.
3. Flusso abbinato a una riga esclusa: ignorato. Flusso senza riga: se la chiave ha una riga esclusa, ignorato; se non ha righe, o se è il secondo importo dello stesso mese, si crea un `rilevato` con `ordine` libero successivo e `da_verificare: true`, salvo due addebiti a distanza di 25-35 giorni.
4. Addebito nuovo su una riga: aggiorna `ultimo_addebito_*`; aggiorna `costo` se l'addebito è più recente del precedente e di `modificato_utente_il`.
5. Riga `annullato` con addebito successivo ad `annullato_il`: torna `attivo` con `riattivato_da_addebito: true`.
6. Riga a tempo oltre la fine con addebito dalla fine in poi: `durata_mesi` e `data_inizio` a `null`, `da_verificare: true`.
7. Programmazioni attive `mensile` o `annuale`: si abbinano prima per `movimento_ricorrente_id`, poi con le stesse regole del punto 2. Impostano il legame e, se l'utente non ha mai modificato la riga, periodo e `da_verificare: false`. Aggiornano il costo se la loro `updatedAt` è più recente dell'ultimo addebito e di `modificato_utente_il`. Non riattivano una riga annullata. `ricorrente_occorrenze_rimanenti` si legge solo alla creazione della riga.
8. Riga attiva con `movimento_ricorrente_id` la cui programmazione è sospesa, terminata, eliminata o non più ricorrente: passa ad `annullato` con `annullato_il` di oggi, e il legame si azzera.
9. Fra gli addebiti non entrano i movimenti con un `ScheduledPayment.movimento_id`, né le occorrenze la cui origine ha frequenza diversa da `mensile` e `annuale`.
10. Filtro di categoria come nel documento, compreso `categorie_ammesse` del catalogo.

Il service esegue `crea` con `bulkCreate({ ignoreDuplicates: true })`. L'intera sincronizzazione sta in un `try/catch`: un errore si registra e l'elenco risponde comunque.

Una `PUT` non cambia la `chiave` delle righe `rilevato`, altrimenti lo stesso servizio verrebbe ricreato. Imposta `modificato_utente_il`, azzera `da_verificare` e `riattivato_da_addebito`. Il client non può scrivere `user_id`, `origine`, `chiave`, `stato` né `ultimo_addebito_*`. `ripristina` su una riga finita toglie durata e data di inizio e imposta `da_verificare: true`.

- [ ] **Passo 1: scrivere i test puri.** Una prova per ogni riga della tabella «Comportamento atteso» del documento, più:

```js
expect(descriviMovimento({ categoria: 'trasferimento_denaro', descrizione: 'Bonifico a Claude Rossi' })).toBeNull();
expect(descriviMovimento({ categoria: null, descrizione: 'NETFLIX.COM' }).servizio_id).toBe('netflix');
expect(descriviMovimento({ categoria: 'abbonamenti', descrizione: '' }).nome).toBe('Abbonamenti');
expect(identificaServizio('APPLE MUSIC').id).toBe('apple-music');
expect(identificaServizio('AMAZON MKTPLACE')).toBeNull();
expect(aggiungiMesi('2027-01-31', 1)).toBe('2027-02-28');
```

Più: addebito con data uguale ad `annullato_il` che non riattiva, e programmazioni `settimanale`, `giornaliera`, `una_tantum` ignorate.

- [ ] **Passo 2: scrivere i test API.**
  - CRUD e validazione, compresi i campi vietati nel corpo.
  - Isolamento: un altro utente riceve 404 e non vede le righe.
  - Due `GET` simultanee con `Promise.all` lasciano una riga sola.
  - Saldi di tutti i conti, `GET /conti/patrimonio` e numero di movimenti identici prima e dopo creazione, lettura, modifica e annullamento.
  - Il movimento periodico che scala resta attivo dopo aver annullato l'abbonamento legato.
- [ ] **Passo 3: eseguire e verificare che falliscano.**
- [ ] **Passo 4: implementare `abbonamentiRilevamento.js`, far passare i test puri.**
- [ ] **Passo 5: implementare service, controller, rotte e validazioni, far passare i test API.**
- [ ] **Passo 6: commit.**

### Task 4: Icone

**File:**
- Crea: `client/src/components/abbonamenti/iconeServizi.js`, `client/src/components/abbonamenti/ServizioIcona.vue`
- Test: `client/tests/iconeServizi.test.js`

**Interfacce prodotte:** `ICONE_SERVIZI` (`{ [id]: { path, colore, testo } }`), `<ServizioIcona :icona :nome :size>`.

- [ ] **Passo 1: scrivere il test.** Ogni `CATALOGO_SERVIZI.id` ha una voce con `path` oppure usa il riquadro con iniziale, e i colori sono esadecimali validi.
- [ ] **Passo 2: scaricare i singoli SVG di Simple Icons (CC0) da jsDelivr in una cartella vuota dello scratchpad, senza eseguire nulla del pacchetto.** Generare `iconeServizi.js` con i soli tracciati dei servizi in elenco. Annotare in testa al file licenza e versione.
- [ ] **Passo 3: implementare `ServizioIcona.vue`:** tracciato su riquadro colorato; senza tracciato, iniziale del nome; per le icone generiche, un'icona di `appIcons`.
- [ ] **Passo 4: eseguire e verificare che passino.**
- [ ] **Passo 5: commit.**

### Task 5: Store, schede e modulo

**File:**
- Crea: `client/src/stores/abbonamenti.store.js`, e in `client/src/components/abbonamenti/`: `AbbonamentoCard.vue`, `AbbonamentiTotali.vue`, `ServizioPicker.vue`, `AbbonamentoForm.vue`, `AbbonamentiSezione.vue`
- Modifica: `client/src/utils/session.js`, `client/src/views/RicorrentiView.vue`
- Test: `client/tests/abbonamentiVista.test.js`, `client/tests/ricorrentiView.test.js`

**Interfacce prodotte:** `useAbbonamentiStore()` con `attivi`, `nonAttivi`, `totali`, `stato`, `lastUpdated`, `fetchAbbonamenti`, `crea`, `modifica`, `annulla`, `escludi`, `ripristina`, `reset`.

- [ ] **Passo 1: scrivere i test** con `renderSfc`, come `ricorrentiView.test.js`:
  - La scheda senza scadenza mostra Durata e All'anno.
  - La scheda a tempo mostra Durata, In totale, In un anno.
  - «Controlla la durata» e la scritta di riattivazione compaiono quando previsto.
  - I totali mostrano la nota solo con `se_tutti_12_mesi` non nullo.
  - Il modulo mostra «Non è un abbonamento» solo per `origine: rilevato` e l'avviso solo con `movimento_ricorrente_id`.
  - `resetPiniaStores` richiama il `reset` del nuovo store.
  - La vista ha titolo «Programmate / Abbonamenti», e la creazione di `+ Nuova` resta come oggi nella scheda Programmate.
- [ ] **Passo 2: eseguire e verificare che falliscano.**
- [ ] **Passo 3: implementare store e reset.** `vuotoSe`: nessun attivo e nessun non attivo.
- [ ] **Passo 4: implementare i componenti** secondo la sezione «La pagina» del documento. Griglia del selettore a 4 colonne per stare sopra i 14px. Conferme con il toast, nomi lunghi che vanno a capo con `overflow-wrap`.
- [ ] **Passo 5: adattare `RicorrentiView.vue`:**
  - Selettore con `role="tablist"`, nello stile di `CategorieView.vue`.
  - Scheda letta e scritta nella query `scheda`, con `router.replace`.
  - Gesto laterale sul contenitore con `decidiAsse` e `touch-action: pan-y`, soglia 60px.
  - `HelpTrigger` e riga di spiegazione che seguono la scheda.
  - `AbbonamentiSezione` caricata alla prima apertura.
- [ ] **Passo 6: eseguire e verificare che passino, compreso `npm run build`.**
- [ ] **Passo 7: commit.**

### Task 6: Nome, aiuto, glossario e documentazione

**File:**
- Modifica: `client/src/config/functionalityItems.js`, `client/src/content/helpTopics.js`, `client/src/content/glossario.js`, `CLAUDE.md`, `docs/API.md`, `docs/DATABASE.md`
- Test: `client/tests/functionalityItems.test.js`, `client/tests/helpTopics.test.js`, `client/tests/glossario.test.js`

- [ ] **Passo 1: aggiungere ai test:** etichetta «Programmate / Abbonamenti» con rotta invariata, argomento `abbonamenti-gestione` con collegamento a `/ricorrenti?scheda=abbonamenti`, voci di glossario `abbonamenti_al_mese` e `abbonamenti_all_anno`.
- [ ] **Passo 2: eseguire e verificare che falliscano.**
- [ ] **Passo 3: implementare.** Testo di aiuto secondo il documento. In `CLAUDE.md`: Regola 28, riga in Sensitive Areas, conteggi di endpoint (174) e migrazioni, tabella in Database.
- [ ] **Passo 4: eseguire e verificare che passino.**
- [ ] **Passo 5: commit.**

### Task 7: Verifica finale

- [ ] **Passo 1:** `cd server && npm test` completo, atteso nessun fallimento nuovo rispetto alla partenza.
- [ ] **Passo 2:** `cd client && npm test && npm run build`.
- [ ] **Passo 3: verifica nel browser, telefono e computer, tema chiaro e scuro:** elenco, totali, modulo, riconoscimento da un movimento reale. I server devono partire dal worktree: il pannello legge `.claude/launch.json` del repository principale, quindi servono configurazioni temporanee, da rimuovere subito dopo, che usino `--prefix` verso il worktree e il database locale `wallt_verifica_browser`.
- [ ] **Passo 4:** rileggere il diff completo e `git status`.
