# Assistenza email in-app

Gli utenti autenticati aprono **Aiuto → Contatta il supporto** e compilano
categoria, oggetto e messaggio. L'indirizzo dell'account è mostrato automaticamente;
il backend lo legge dal database, senza fidarsi di identità o destinatari nel body.
Il footer nelle pagine legali porta al form per gli utenti autenticati.

## Configurazione Vercel

L'assistenza usa **Resend**, lo stesso mittente delle email di benvenuto e
recupero password: `RESEND_API_KEY` e `EMAIL_FROM` sono gia' configurate e non
vanno duplicate. Nel progetto **API `wallt-api`**, directory `server`, serve una
sola variabile in piu':

```env
SUPPORT_EMAIL=support@pec.wallt.it
```

Applicarla a Production e ridistribuire l'API. Non occorrono variabili del
frontend per il form, e nessun segreto nuovo: la chiave Resend esisteva gia'.

`From` e' `EMAIL_FROM`, l'unico mittente sul dominio verificato in Resend. La
richiesta arriva a `SUPPORT_EMAIL` con `Reply-To` uguale all'email dell'utente
letta nel database, quindi rispondere dalla casella scrive direttamente a lui.
La conferma va all'utente, con `Reply-To` del supporto.

**`SUPPORT_EMAIL` deve leggere posta ordinaria.** Una casella PEC configurata
per accettare solo altre PEC rifiuterebbe il messaggio, perche' Resend invia da
un dominio normale.

### Perche' non SMTP PEC Aruba

La prima versione usava Nodemailer verso `smtps.pec.aruba.it:465`. In produzione
l'autenticazione veniva rifiutata con `EAUTH` e stato SMTP `535`, riproducibile
anche da rete italiana: quindi non un blocco dell'IP di Vercel, ma credenziali
non accettate dalla casella (su Aruba, con la verifica in due passaggi attiva
serve una password dedicata al programma di posta).

Oltre a questo, la PEC era comunque inadatta alla **conferma all'utente**: le PEC
incapsulano i messaggi in una busta di trasporto che le caselle ordinarie
gestiscono male. Resend risolve entrambi i problemi e non aggiunge dipendenze:
era gia' nel progetto e gia' in uso. `nodemailer` e le variabili `SMTP_*` sono
state rimosse.

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
- `200` con `confirmationSent: false`: richiesta accettata dal provider del
  supporto, ma conferma utente fallita. L'interfaccia lo spiega e non chiede di
  reinviare la richiesta.
- `400`: campi non validi; `401`: sessione assente/non valida; `405`: metodo diverso
  da POST; `429`: troppi tentativi; `502`: invio o configurazione non riusciti. Il
  motivo esatto non raggiunge mai il client: viene registrato lato server come
  `reason` (`config:<NOME>`, `email:<stato>`, `invalid_user_data`), e compare
  anche nel testo del log perche' resti leggibile dove `meta` e' collassato.

Il backend attende l'invio principale e poi quello di conferma, entro la durata
Vercel configurata di 60 secondi; il client attende altrettanto. I log riportano
il solo `reason`: mai chiavi API, testo dei messaggi o messaggi grezzi del
provider, che possono contenere dati dell'utente.
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
- `cd server && npm run test:unit`: inclusi i test del servizio con Resend simulato.
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
- `server/services/email/SupportEmailService.js`: composizione delle due email su Resend.
- `server/tests/support.test.js`: test endpoint e limiter persistente.
- `server/tests/supportEmail.test.js`: test email, configurazione e cancellazione timeout.
- `docs/SUPPORT.md`: questa guida.

Modificati per la funzione:

- `client/src/views/AiutoView.vue`: integrazione del form.
- `client/src/components/layout/LegalFooter.vue`: link al form per utenti autenticati.
- `server/app.js`: collegamento dell'endpoint.
- `server/package.json` e `server/package-lock.json`: rimozione di Nodemailer,
  non piu' necessario con Resend.
- `server/jest.unit.config.js`: inclusione dei test del servizio email senza database.
- `server/.env.example`: solo `SUPPORT_EMAIL`; le `SMTP_*` sono state rimosse.
- `docs/API.md` e `docs/EMAIL.md`: riferimenti alla nuova funzione.

Restano inoltre le modifiche della precedente richiesta ai contatti pubblici:
`client/.env.example`, `client/src/views/PrivacyPolicy.vue`,
`client/src/views/TermsView.vue`, oltre a footer e documentazione email.
Le modifiche preesistenti ai file backend delle notifiche non fanno parte
di questa implementazione e non sono state toccate.
