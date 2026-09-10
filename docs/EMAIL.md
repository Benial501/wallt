# Email WALLT con Resend

WALLT usa il proprio backend Express/JWT per registrazione e recupero password.
Supabase ospita PostgreSQL; Supabase Auth, i suoi template e Custom SMTP non
intervengono in questi flussi e non richiedono configurazione.

## Contatti pubblici

Il recapito per assistenza, privacy e comunicazioni legali è
`support@pec.wallt.it` (PEC Aruba). È usato nel footer condiviso, anche nelle
pagine di accesso, e nelle pagine Privacy Policy e Termini e Condizioni.

Il frontend usa questo indirizzo come valore predefinito. Le variabili
`VITE_SUPPORT_EMAIL`, `VITE_COMPANY_EMAIL` e `VITE_LEGAL_EMAIL`, se presenti,
hanno precedenza: impostarle tutte a `support@pec.wallt.it` anche nell'ambiente
di deploy e ricostruire il frontend per applicare eventuali modifiche.
Il mittente automatico Resend resta `noreply@auth.wallt.it`.

## Assistenza in-app

Gli utenti autenticati possono inviare richieste da **Aiuto → Contatta il supporto**
tramite SMTP PEC Aruba. Configurazione, endpoint e limiti sono in [SUPPORT.md](SUPPORT.md).
Questo flusso è separato dagli invii Resend descritti sotto.

## Produzione

- Dominio Resend: `auth.wallt.it`, verificato il 9 settembre 2026, regione Irlanda.
- Progetto Vercel backend: `wallt-api`, directory `server`.
- `RESEND_API_KEY`: secret Production, chiave `wallt-production`, solo Sending
  access sul dominio `auth.wallt.it`. Non copiare il valore in questo documento.
- `EMAIL_FROM`: `Wallt <noreply@auth.wallt.it>`.
- `APP_URL`: `https://www.wallt.it` (pulsante e logo del benvenuto).
- `PASSWORD_RESET_URL`: `https://www.wallt.it/reset-password`.
- Ogni modifica alle variabili richiede un nuovo deploy del backend.

Record aggiunti su Aruba (nomi relativi alla zona `wallt.it`, TTL 1 ora):

- TXT `resend._domainkey.auth`: chiave pubblica DKIM fornita da Resend.
- CNAME `rsend.auth`: `rsend-euw1.forge.rmta.net`.
- CNAME `send.auth`: `send.forge.rmta.net`.

Questa configurazione Resend usa i CNAME per l'invio/Return-Path e non richiede
nuovi MX. L'MX principale `@ → mx.wallt.it` (priorità 10), i record del sito,
i name server Aruba e DNSSEC sono stati preservati. La ricezione Resend è
disabilitata. La PEC resta separata.

## Benvenuto

Il backend attende l'invio dopo aver creato e caricato l'utente completo, sia
per registrazione locale sia per la prima registrazione Google. Login successivi
e registrazioni duplicate non inviano un altro benvenuto. Non esiste un endpoint
pubblico di invio: destinatario e nome provengono dall'utente salvato.

Il template contiene HTML con stili inline, versione testo, logo ufficiale e
un saluto generico se manca il nome. Il nome viene escapato nell'HTML. La chiave
idempotente `welcome-user-<id>` protegge ulteriormente richieste ripetute verso
Resend per la finestra di 24 ore del provider.

L'invio è best effort: un errore del provider viene registrato senza annullare
l'account. Non è presente una coda di retry. Il benvenuto viene inviato solo per
nuovi account, non retroattivamente. Attualmente WALLT non richiede verifica
email alla registrazione; se introdotta, spostare l'invio dopo la conferma.

## Verifiche

`cd server && npm test` esegue anche i test del nuovo template e dei flussi
registrazione, Google e mancato invio. `npm run test:unit` include il template
senza bisogno di PostgreSQL. Il trasporto Resend è simulato nei test automatici.
La consegna reale va verificata separatamente nel pannello Emails di Resend.
