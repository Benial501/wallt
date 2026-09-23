# Financial History Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correggere i denominatori dello storico per fondo sicurezza e stabilità delle entrate, propagando periodo e sufficienza fino a `getFinancialContext`, con test e documentazione coerenti.

**Architecture:** Riutilizzare `classificaFinestra` come fonte unica per finestre richiesta/osservata/completa. Il fondo userà l'aggregazione già classificata da `spese.service`; le entrate riceveranno il primo movimento per escludere il primo mese parziale e calcoleranno stabilità sui soli mesi completi osservati.

**Tech Stack:** Node.js, Jest, Sequelize/PostgreSQL di test, Vue/Vite per verifica build/browser.

**Spec:** Testo incollato dall'utente in `/Users/christianmaiolo/.codex/attachments/bf86906e-53f2-47c2-9e54-ef84de23aca1/Testo incollato.txt`.

## Global Constraints

- Non implementare Piano Smart.
- Non usare produzione o database personale; test e browser solo su ambiente locale isolato.
- Preservare API esistenti e modifiche locali dell'utente.
- La completezza delle registrazioni resta non verificabile con soli movimenti manuali.

## Review Focus

- Un solo mese completo non deve essere diluito su tre mesi: test fondo con 900/2700.
- Il primo mese parziale non entra nelle medie: test fondo e reddito.
- Il mese corrente non altera stabilità o pressione debitoria: test entrate/context.
- Gli zeri nei mesi chiusi osservati partecipano alla variabilità: test entrate.
- Categorie non classificate mantengono il segnale di qualità: test fondo/context.

### Task 1: Audit e regressioni rosse

**Files:** `server/tests/fondoSicurezza.test.js`, `server/tests/entrate.service.test.js`, `server/tests/financialContext.test.js`.

- [ ] Aggiungere test deterministici per lo storico breve del fondo e per stabilità su tre mesi completi più mese corrente.
- [ ] Eseguire i test mirati e verificare che falliscano sul codice attuale per il denominatore errato/stabilità corrente.

### Task 2: Correzione fondo sicurezza

**Files:** `server/services/fondoSicurezza.service.js`, `server/services/financialContext.service.js`.

- [ ] Usare `aggregato.finestra.completi.length` come denominatore, mantenendo finestra richiesta/osservata/completa e stato esplicito.
- [ ] Aggiungere metadati di sufficienza/limitazione senza rompere i campi esistenti.
- [ ] Verificare tramite test puri/API e almeno una suite PostgreSQL già configurata.

### Task 3: Correzione stabilità entrate

**Files:** `server/services/entrate.service.js`, `server/services/financialContext.service.js`, test entrate/context.

- [ ] Estendere la classificazione della finestra alle entrate con primo movimento e calcolare CV sui mesi completi utilizzabili.
- [ ] Conservare `media_mensile` legacy e distinguere la metrica usata dal contesto.
- [ ] Applicare la soglia minima di tre mesi e propagare periodo/mesi/sufficienza a income e dataQuality.

### Task 4: Documentazione e verifica

**Files:** `AGENTS.md`, `CLAUDE.md`, documentazione finanziaria pertinente, `progress.md` se esistente.

- [ ] Documentare fonte unica, finestre, storico breve, stabilità, ricorrenti/debiti e migrazioni senza duplicare formule.
- [ ] Preparare database/browser locale isolato, eseguire login normale e verificare categorie per utenti A/B; salvare evidenze senza credenziali.
- [ ] Eseguire test backend, test frontend, build e controllo diff/stato Git.
