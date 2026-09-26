# Fondo di emergenza: un conto, non un obiettivo

Data: 26 settembre 2026
Stato: approvato, in implementazione

## Il problema

Piano Smart suggerisce di costruire un fondo di sicurezza e mostra una quota
`safety`, ma quel suggerimento non porta da nessuna parte: nell'app non esiste
**un posto dove tenere quei soldi**. Il backend modella il fondo come
`Obiettivo` con `tipo_obiettivo: 'fondo_sicurezza'` ed espone gia
`GET /obiettivi/:id/copertura`, che calcola i mesi coperti sulle spese
essenziali. Il client non invia mai quel `tipo_obiettivo` e non chiama mai
quell'endpoint: la funzione esiste, e non e raggiungibile da nessuna schermata.

Un obiettivo, inoltre, non risolve il bisogno reale. Un obiettivo e un traguardo
con un contatore; un fondo di emergenza e un contenitore di denaro, che si
alimenta e da cui si preleva.

## La decisione

Il fondo di emergenza e **un conto vero**. L'idea di fondo-come-obiettivo viene
rimossa dal progetto.

- `Conto` con `tipo: 'emergenza'` e `nascosto: true`.
- La soglia si esprime in **mesi** di spese essenziali, non in euro.
- Nessun `Obiettivo` coinvolto, quindi nessun rischio di contare due volte lo
  stesso euro (vedi "Perche questa forma" sotto).

### Vincoli applicati dal server

1. **Uno solo per utente.** Un secondo `POST` risponde `409` con l'id di quello
   esistente, invece di creare un doppione.
2. **`nascosto` forzato a `true` e non modificabile** finche il conto e di tipo
   `emergenza`. E il "default non cambiabile" del requisito: i soldi del fondo
   non compaiono fra quelli spendibili.
3. **Nessuna entrata o uscita diretta** sul conto: solo trasferimenti interni.
   Il denaro entra e esce solo spostandolo da un altro conto.
4. **`tipo` non convertibile** da o verso `emergenza` con un `PATCH /conti/:id`:
   cambiare tipo aggirerebbe i vincoli 2 e 3.

Il vincolo 3 e una scelta del prodotto con un costo noto: un divieto tecnico puo
spingere qualcuno a registrare un prelievo su un altro conto, falsando i dati.
E accettato deliberatamente, mitigato cosi: il divieto vale per i movimenti
manuali e per l'import (il conto non appare fra le destinazioni selezionabili),
mentre il trasferimento in uscita e permesso e mostra prima quanto scende la
copertura.

### Perche questa forma

`nascosto` fa gia esattamente cio che serve: il conto resta nel patrimonio
totale (Regola 12) ma esce dal saldo effettivo mostrato in home **e** dal
capitale allocabile di Piano Smart (`liquidita_allocabile`), perche
`liquidita.service.js` tratta cosi tutti i conti nascosti. Di conseguenza
**l'area saldi non viene toccata**: nessuna riga cambia in
`liquidita.service.js`, `financialSummary.service.js` o
`movimenti.controller.js` per quanto riguarda il calcolo degli importi.

Se il fondo fosse stato conto **piu** obiettivo, lo stesso euro sarebbe uscito
due volte dal saldo effettivo: una volta perche il conto e nascosto, una volta
perche `Obiettivo.importo_attuale` entra in `liquidita_allocata`. E il difetto
che la Regola 20 esiste per prevenire, ed e la ragione per cui l'obiettivo
scompare del tutto invece di restare accanto al conto.

`tipo` come discriminante segue la convenzione gia in uso per i conti
`scommesse` (Regola 5), invece di aggiungere una colonna booleana.

## Modello dati

Una migrazione sola, su `conti`:

- `mesi_sicurezza_target` INTEGER NULL — la soglia, in mesi. Sta sul conto
  perche il conto **e** il fondo. Valori ammessi: 3, 6, 12.

La soglia in euro non viene mai salvata: e sempre
`mesi_sicurezza_target × spese_essenziali_mensili`, ricalcolata a ogni lettura,
cosi resta corretta quando le spese cambiano.

`tipo: 'emergenza'` entra nelle whitelist `CONTO_TIPI_CREATE` e
`CONTO_TIPI_UPDATE` di `validation.middleware.js`.

## Punto sorgente unico

Nuovo `services/fondoEmergenza.service.js`: l'unico posto che risponde "qual e
il fondo, quanto contiene, quanti mesi copre, quanto manca" (Regola 20). Chi
consuma il concetto chiama lui, non ricalcola.

Riusa `calcolaMesiCopertura` di `fondoSicurezza.service.js`, che resta ma viene
generalizzato: oggi riceve un `obiettivo` e ne legge `importo_attuale`, dopo la
modifica riceve un importo. Tutta la logica difficile e gia scritta e testata e
non viene riscritta: media sulle spese `essenziale` dei soli mesi civili
completi, e gli stati `dati_insufficienti`, `non_calcolabile`,
`storico_limitato`, `classificazione_incompleta`.

## API

Tre rotte sotto `/api/fondo-emergenza`. Nessuna di esse muove denaro.

- `GET /api/fondo-emergenza` — stato completo per la pagina: conto, saldo, mesi
  target, copertura, soglia in euro, quanto manca, spese essenziali medie,
  periodo osservato, stato dei dati. Risponde anche quando il fondo non esiste
  (`esiste: false`) con la copertura potenziale, cosi la card in home sa cosa
  mostrare senza una seconda chiamata.
- `POST /api/fondo-emergenza` — crea il conto (nome, mesi target, saldo 0).
- `PATCH /api/fondo-emergenza` — cambia i mesi target.

Per versare o prelevare **non si aggiunge nulla**: si usa il trasferimento
interno esistente (`POST /api/conti/trasferimento`), che aggiorna i saldi di
entrambi i conti in transazione (Regola 6: non duplicare logica).

`PATCH` e `POST` sono gia in `Access-Control-Allow-Methods` (Regola 21): la
nuova rotta viene comunque coperta da `corsMetodi.test.js`.

## Cosa viene rimosso

- `tipo_obiettivo: 'fondo_sicurezza'` esce dalle whitelist di validazione e dal
  filtro in `pianoSmart/profile.service.js`.
- `GET /obiettivi/:id/copertura` viene eliminato, con il suo controller.
- La colonna `tipo_obiettivo` **resta** (valore `generico`) per non rompere le
  righe esistenti: nessun dato reale usa `fondo_sicurezza`, perche il client non
  lo ha mai inviato.

Il contratto verso Piano Smart **non cambia forma**: `emergencyFund` resta
identico in `financialContext.service.js`, cambia solo da dove legge — il conto
invece dell'obiettivo, con `status: 'assente'` quando il conto non c'e. Il
motore di Piano Smart, i suoi test di invarianza e il glossario non vengono
toccati. La Regola 21 ("il fondo non e un obiettivo eleggibile per la quota
`goals`") diventa vera per costruzione invece che per un filtro.

## Interfaccia

**Card in home, in fondo alla pagina** (`FondoEmergenzaCard.vue`), con un ciclo
di vita: finche il fondo non esiste e un invito ("Crea il conto di emergenza");
appena esiste diventa la sintesi cliccabile ("Fondo di emergenza · 2,4 mesi su
6"). Una cosa sola che cambia stato, non un invito che resta per sempre a
chiedere qualcosa di gia fatto.

**Conferma di creazione**: una modale che spiega cosa sta per succedere (un
conto separato, fuori dai soldi spendibili, da cui si sposta denaro solo con un
trasferimento) e chiede quanti mesi coprire: 3, 6 o 12. Il conto nasce vuoto.

**Pagina dedicata** `/fondo-emergenza` (`FondoEmergenzaView.vue`): quanto c'e
nel fondo, quanti mesi copre, le spese essenziali mensili medie su cui e
calcolato, la soglia in euro per i mesi scelti e quanto manca; il selettore dei
mesi; un pulsante per spostare denaro nel fondo che apre il trasferimento
esistente.

Quando i dati non bastano la pagina **non inventa numeri**: mostra lo stato
reale (`dati_insufficienti`, `non_calcolabile`) e cosa fare per uscirne —
classificare l'essenzialita delle categorie, o registrare un mese completo di
spese. E lo stato iniziale normale di un utente nuovo, non un caso limite.

**Piano Smart**: dove oggi il riepilogo dice "non impostato", un link porta a
`/fondo-emergenza`.

**Glossario**: nuova voce per "Fondo di emergenza" in
`client/src/content/glossario.js` (Coding Rule 18), cosi l'etichetta e il
significato stanno in un posto solo.

## Test

Nuovi, backend:

- creazione, unicita (409 sul secondo), `nascosto` forzato e non modificabile,
  `tipo` non convertibile;
- rifiuto di entrata/uscita diretta sul conto, trasferimento consentito;
- copertura con storico limitato, assente e non classificato;
- isolamento cross-user su tutte e tre le rotte;
- il conto emergenza resta nel patrimonio totale ed esce dal saldo effettivo
  (prova di regressione sul confine fra Regola 12 e Regola 20).

Aggiornate: le suite che citano `fondo_sicurezza` come obiettivo
(`fondoSicurezza`, `financialContext`, `essenzialita`, le suite Piano Smart e
`migrazioniReali`).

Frontend: la card in home nei suoi due stati e la vista con i suoi stati dei
dati.

## Rischi residui

- Il divieto di uscite dirette (vincolo 3) puo spingere a registrare un prelievo
  su un altro conto. Accettato, mitigato come descritto sopra.
- La copertura dipende dalla classificazione di essenzialita delle categorie: se
  l'utente non classifica nulla, resta `non_calcolabile`. La pagina lo dice e
  indirizza, ma resta un prerequisito di dati che l'app non puo aggirare.
