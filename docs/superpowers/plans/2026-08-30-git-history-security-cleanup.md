# Git History Security Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pubblicare lo stato finale sicuro di WALLT come unico commit Git, eliminando tutta la cronologia precedente e ogni credenziale versionata.

**Architecture:** Si conserva il working tree corrente, si bonificano file e ignore, si verifica il contenuto destinato a GitHub, quindi si crea un commit radice senza genitori e si sostituisce `origin/main`. La verifica finale controlla albero tracciato, segreti, test backend, build frontend e numero di commit remoto.

**Tech Stack:** Git, Node.js, npm, Vue/Vite, Express/Jest.

**Spec:** Richiesta utente del 30 agosto 2026 in questa task.

## Global Constraints

- Conservare tutte le modifiche funzionali attualmente presenti nel working tree.
- Non pubblicare file `.env` reali, credenziali, log, database, upload o dipendenze generate.
- Mantenere solamente i file `.env.example` con valori innocui.
- Sostituire tutta la cronologia di `origin/main` con un unico commit radice.
- Non stampare valori sensibili durante le verifiche.

---

### Task 1: Bonifica dell'albero pubblico

**Files:**
- Modify: `.gitignore`
- Modify or remove: `PASSWORD_RESET_RESEND_REPORT.md`
- Preserve: `client/.env.example`, `server/.env.example`, `server/.env.test.example`

**Interfaces:**
- Consumes: working tree corrente e inventario Git.
- Produces: insieme di file sicuro da inserire nell'unico commit.

- [ ] **Step 1: Inventariare file tracciati, non tracciati e ignorati**

Run: `git status --short && git ls-files && git status --ignored --short`

Expected: identificazione completa di file locali e pubblicabili.

- [ ] **Step 2: Rafforzare `.gitignore`**

Assicurare esclusione di `.env`, `.env.test`, log, database, upload, copertura, build e dipendenze, mantenendo le varianti `*.example`.

- [ ] **Step 3: Rimuovere segreti dai documenti pubblici**

Eliminare qualsiasi valore con formato di credenziale da `PASSWORD_RESET_RESEND_REPORT.md`, mantenendo soltanto placeholder espliciti se il documento resta utile.

- [ ] **Step 4: Scansionare l'albero candidato**

Run: scansione per chiavi private, token provider, password valorizzate e file sensibili; mostrare solo nomi file e categorie, mai i valori.

Expected: nessuna credenziale reale rilevata.

### Task 2: Verifica applicativa

**Files:**
- Test: `server/tests/**`
- Test: `client/**`

**Interfaces:**
- Consumes: albero pubblico bonificato.
- Produces: evidenza che la versione finale è eseguibile.

- [ ] **Step 1: Eseguire i test backend**

Run: `cd server && npm test -- --runInBand`

Expected: tutte le suite completate senza errori.

- [ ] **Step 2: Eseguire la build frontend**

Run: `cd client && npm run build`

Expected: build Vite completata con exit code 0.

### Task 3: Creazione e pubblicazione del commit radice

**Files:**
- Replace: cronologia Git di `main` e `origin/main`

**Interfaces:**
- Consumes: albero verificato della Task 2.
- Produces: repository remoto con un solo commit pubblico.

- [ ] **Step 1: Creare un indice temporaneo senza genitori**

Usare un indice Git temporaneo per aggiungere esclusivamente i file non ignorati del working tree e creare un tree object.

- [ ] **Step 2: Creare il commit radice finale**

Creare un commit senza parent con messaggio `chore: publish sanitized WALLT project` e spostare `main` su quel commit.

- [ ] **Step 3: Verificare il commit prima del push**

Run: controllo numero commit, lista file e scansione credenziali sul nuovo `HEAD`.

Expected: un solo commit e nessun file/valore sensibile.

- [ ] **Step 4: Sostituire `origin/main`**

Run: `git push --force-with-lease origin main`

Expected: push accettato e riferimento remoto aggiornato.

- [ ] **Step 5: Verificare il remoto**

Run: fetch del riferimento e controllo che `origin/main` abbia un solo commit raggiungibile e coincida con `HEAD`.

Expected: `HEAD == origin/main` e conteggio commit uguale a 1.
