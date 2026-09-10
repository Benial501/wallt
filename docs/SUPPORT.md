# Assistenza email in-app

Gli utenti autenticati aprono **Aiuto → Contatta il supporto** e compilano
categoria, oggetto e messaggio. L'indirizzo dell'account è mostrato automaticamente;
il backend lo legge dal database, senza fidarsi di identità o destinatari nel body.
Il footer nelle pagine legali porta al form per gli utenti autenticati.

## Configurazione Vercel

Nel progetto **API `wallt-api`**, directory `server`, aggiungere:

```env
SMTP_HOST=smtps.pec.aruba.it
SMTP_PORT=465
SMTP_USER=support@pec.wallt.it
SMTP_PASSWORD=<password della casella PEC configurata su Vercel>
SUPPORT_EMAIL=support@pec.wallt.it
```

`SMTP_PASSWORD` va salvata come secret nelle Environment Variables, mai in Git,
nel frontend o in una variabile `VITE_*`. Applicare i valori a Production;
configurare separatamente Preview/Development solo se si desidera inviare email
anche da tali ambienti. Dopo la configurazione, ridistribuire backend e frontend.
Non occorrono nuove variabili del frontend per il form.

Si usa la **PEC** confermata per questa funzione: `smtps.pec.aruba.it`, porta 465,
TLS implicito (`secure: true`), verifica del certificato attiva. `smtps.aruba.it`
è invece il server della posta ordinaria Aruba. I protocolli SMTP della casella
PEC devono essere abilitati. Consultare la [guida ufficiale Aruba](https://guide.aruba.it/pec/configurazione-programmi-di-posta/client-posta-e-dispositivi-mobili).

`From` usa il nome `Wallt Support` e l'indirizzo `SMTP_USER`. La richiesta arriva
all'indirizzo `SUPPORT_EMAIL`, con `Reply-To` uguale all'email dell'utente letta
nel database. Entrambe le variabili indirizzo vanno impostate alla PEC sopra.
La conferma va all'utente, con `Reply-To` del supporto. Il mittente Resend delle
email di benvenuto e recupero password rimane invariato.

## API e protezioni

`POST /api/support`, con il normale JWT Bearer WALLT. Body:

```json
{
  "category": "Problema tecnico",
  "subject": "Problema inserimento spesa",
  "message": "Non riesco a salvare una spesa dal telefono."
}
```

Categorie: Problema tecnico, Problema con l'account, Problema con entrate/uscite,
Suggerimento, Segnalazione bug, Altro. Oggetto: 1–160 caratteri dopo trim;
messaggio: 1–5000. I campi devono essere stringhe. Caratteri di controllo
negli header sono rifiutati; il corpo email usa solo testo, senza HTML utente.
Il form blocca i doppi clic e mantiene i campi in caso di errore.

Il limite è **3 tentativi ogni 15 minuti per utente**, persistente nella tabella
`auth_rate_limits` già esistente, con namespace `support`. Resta attivo anche
quando il limiter API generale è disabilitato nei test. È condiviso tra istanze
Vercel e non dipende dalla memoria del processo; i tentativi non validi contano.
L'autenticazione precede il limiter. Nessun destinatario arbitrario dal client.

Risposte:

- `200`: `{ "message": "Richiesta inviata", "confirmationSent": true }`.
- `200` con `confirmationSent: false`: richiesta accettata dal server SMTP del
  supporto, ma conferma utente fallita. L'interfaccia lo spiega e non chiede di
  reinviare la richiesta.
- `400`: campi non validi; `401`: sessione assente/non valida; `405`: metodo diverso
  da POST; `429`: troppi tentativi; `502`: invio SMTP o configurazione non riusciti.

Il backend attende l'invio principale e poi quello di conferma. Ogni invio ha
un limite di attesa di 20 secondi e timeout SMTP ridotti, entro la durata Vercel
configurata di 60 secondi. Alla scadenza viene distrutto anche il socket TLS,
interrompendo lo scambio SMTP ancora attivo. Il client attende fino a 60 secondi. I log contengono
solo avvisi generici: niente password, testo dei messaggi o errori SMTP grezzi.
Le email al supporto includono email utente, ID, categoria, oggetto, messaggio,
data UTC, versione API e ambiente server.

## Database e limiti

**Nessuna nuova migrazione SQL e nessuna modifica distruttiva.** La prima versione
usa la casella email come archivio: non introduce `support_tickets`, storico
nell'app o stati ticket. La tabella `auth_rate_limits` deve già essere presente
(migrazione esistente `20260830000012-create-auth-rate-limits.js`, con RLS abilitata
e accesso pubblico revocato). L'accesso passa dal backend Express/Sequelize,
non da Supabase Auth o da un client Supabase nel browser.

L'accettazione SMTP non garantisce la consegna finale: verificare separatamente
ricezione nella PEC e conferma su una casella ordinaria dopo il deploy. Non c'è
una coda di retry automatico. Se la connessione cade dopo l'accettazione SMTP,
l'esito può essere incerto; un reinvio manuale può produrre un duplicato.
La protezione per utente non sostituisce un limite globale multi-account.

## Verifica

- `cd client && npm test` e `npm run build`.
- `cd server && npm test`: inclusi test endpoint con PostgreSQL isolato.
- `cd server && npm run test:unit`: inclusi test del servizio con SMTP simulato.
- Controllo manuale del form in anteprima locale con invio simulato: apertura,
  validazione, caricamento, successo, errore, limite e conferma parziale;
  dark/light e viewport mobile.

Gli script del progetto non espongono un comando lint separato. Nessuna password
reale è necessaria per eseguire i test automatici.

## File dell'implementazione

Creati:

- `client/src/components/help/SupportContact.vue`: form e feedback.
- `server/routes/support.routes.js`: autenticazione, validazione, limiter e POST.
- `server/controllers/support.controller.js`: identità database e risposte sicure.
- `server/services/email/SupportEmailService.js`: trasporto SMTP PEC e due email.
- `server/tests/support.test.js`: test endpoint e limiter persistente.
- `server/tests/supportEmail.test.js`: test email, configurazione e cancellazione timeout.
- `docs/SUPPORT.md`: questa guida.

Modificati per la funzione:

- `client/src/views/AiutoView.vue`: integrazione del form.
- `client/src/components/layout/LegalFooter.vue`: link al form per utenti autenticati.
- `server/app.js`: collegamento dell'endpoint.
- `server/package.json` e `server/package-lock.json`: dipendenza Nodemailer.
- `server/jest.unit.config.js`: inclusione dei test SMTP senza database.
- `server/.env.example`: configurazione pubblica di esempio, password vuota.
- `docs/API.md` e `docs/EMAIL.md`: riferimenti alla nuova funzione.

Restano inoltre le modifiche della precedente richiesta ai contatti pubblici:
`client/.env.example`, `client/src/views/PrivacyPolicy.vue`,
`client/src/views/TermsView.vue`, oltre a footer e documentazione email.
Le modifiche preesistenti ai file backend delle notifiche non fanno parte
di questa implementazione e non sono state toccate.
