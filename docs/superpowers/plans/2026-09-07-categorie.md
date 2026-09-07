# Categorie WALLT — piano di implementazione

Obiettivo: catalogo ampliato, categorie personali isolate, correzioni prioritarie e classificazione prudente.

Architettura: preservare Movimento.categoria VARCHAR e tutti gli identificatori storici. Catalogo default JSON condiviso tra client/server; tabella categorie_personali con UUID prefissato, proprietario, tipo, nome normalizzato univoco, icona, colore, attiva. Archiviazione conserva riferimenti storici e impedisce nuove assegnazioni. Nessuna riclassificazione retroattiva né modifica dei saldi.

- [ ] Catalogo e API: test HTTP CRUD/isolamento/tipo/archiviazione; modello CategoriaPersonale, migrazione additiva, servizio categorie, routes /api/categorie, controlli in movimenti e ImportService. Duplicati nome per utente/tipo vietati, default immutabili.
- [ ] Classificazione: test merchant sporchi, precedenza personale, sconosciuti e soglia. CategoryMatcherService resta unico decisore della categoria nella preview; MerchantAnalyzer conserva arricchimento. Regole personali esistenti riusate, categoria validata contro catalogo dell'utente. OpenAI riceve catalogo disponibile e restituisce solo ID ammessi, timeout e consenso invariati.
- [ ] Apprendimento: aggiornare regola esistente per firma/tipo, conservare dettagli distintivi come Amazon Prime; serializzare correzioni sul proprietario ed evitare regole duplicate. Disattivare regole di categorie archiviate.
- [ ] Frontend: catalogo reattivo comune, caricamento per sessione e reset logout; Impostazioni → Categorie, creazione/modifica/archiviazione; selettori filtrati, nomi e icone anche nello storico, confidenza numerica e stato da verificare in preview.
- [ ] Verifica: npm test backend con DB esclusivamente test, test/build frontend, diff rispetto alle modifiche preesistenti. Documentare API e migrazione di produzione separata.

File coinvolti: server/constants/categorie.js, server/models/index.js, nuovo modello/migrazione/routes/service categorie; controllers/movimenti.controller.js; services/import/{ImportService,CategoryMatcherService,CategoryLearningService}.js; services/merchant/{patternUtils,PersonalMerchantRulesService,MerchantNormalizer}.js; services/import/category/OpenAICategoryClassifier.js; client/src/utils/categorie.js, session.js, AppLayout.vue, CategoryIcon.vue, nuova CategorieView.vue, router/index.js, ImpostazioniView.vue, MovimentoForm.vue, ImportaView.vue; tests categorie e classificazione; docs/CATEGORIES.md.

Trasferimenti: restano tipo separato con due conti. Segnali espliciti di giroconto/prelievo/versamento vengono segnalati in preview e richiedono gestione esplicita, senza inventare una controparte e senza classificarli come consumo ordinario.
