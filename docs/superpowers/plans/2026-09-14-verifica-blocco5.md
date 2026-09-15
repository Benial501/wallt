# Verifica a schermo del blocco 5 — esito

> Task 6 del piano `2026-09-14-leggibilita-grafico-filtri.md`.
> Eseguita sul worktree `leggibilita-grafico-filtri`, commit `53f451d`.

## Come è stata fatta

Non a occhio. Le schermate non misurano un rapporto di contrasto, e l'occhio non
distingue 4.3 da 4.6 — che è esattamente l'intervallo dove stavano i difetti.

La verifica è un audit degli **stili calcolati** eseguito nella pagina viva: per
ogni elemento che contiene testo proprio, si legge il colore effettivo, si
ricostruisce lo sfondo risalendo gli antenati e componendo le superfici
traslucide, e si confronta il rapporto con la soglia WCAG che compete a quella
dimensione.

È diverso da `client/tests/contrasto.test.js`, che legge il CSS **sorgente** e
verifica le coppie dichiarate. L'audit a schermo vede quello che il test non può
vedere: ereditarietà, sovrascritture, superfici sovrapposte, e soprattutto le
coppie che *nessuno aveva dichiarato*.

## Prima cosa trovata: si stava verificando il codice sbagliato

`preview_start` legge `.claude/launch.json` dal **checkout principale**, i cui
percorsi sono relativi. Il dev server serviva quindi `client/` del checkout
principale, non del worktree: i token letti dal browser erano quelli di prima
del blocco 5, e `--text-xs` non esisteva.

Senza accorgersene, l'intera verifica sarebbe stata condotta con cura su codice
che non è questo, e il Task 6 sarebbe stato firmato come superato.

Aggirato avviando il client dal worktree e aprendo la scheda sull'URL. La voce
in `.claude/launch.json` con i percorsi assoluti resta **non committata**: è
impalcatura locale, non parte del deliverable.

## Quattro errori di metodo, corretti prima di registrare risultati

Ogni audit automatico è un programma, e un programma sbagliato produce difetti
inventati con la stessa sicurezza con cui produce quelli veri. Questi quattro
sono stati scoperti tutti per lo stesso motivo: **un numero troppo assurdo per
essere vero**.

| # | Errore | Sintomo | Come è emerso |
|---|---|---|---|
| 1 | Colori letti **durante le transizioni** di tema | Un CTA a 1.11:1 che sta a 17:1 | Il valore era impossibile. Aggravato dal fatto che una scheda in secondo piano strozza rAF e lascia le transizioni a metà |
| 2 | Sfondo di base preso da `html`, che è `rgba(0,0,0,0)` | Contrasti calcolati contro il nero | La base risultava `[0,0,0]` in entrambi i temi |
| 3 | Parser cieco a `color(srgb r g b)` — la notazione che `color-mix` produce | Tutti gli importi dei movimenti a 1.17:1 | Un verde e un rosso davano lo **stesso** rapporto sullo stesso sfondo |
| 4 | Sfondi a **gradiente** ignorati: `backgroundColor` li riporta trasparenti | Il pulsante primario a 1.07:1 invece di ~9.9 | Il valore era impossibile |

Corretti: transizioni disattivate prima di misurare, base letta da `body`,
parser esteso alle due notazioni, e per un gradiente si prende il **peggiore**
fra i suoi capi.

Se i valori sbagliati fossero stati plausibili — 4.2 invece di 4.6 — sarebbero
stati registrati come difetti e "corretti". È il rischio vero di questo tipo di
verifica, e vale la pena scriverlo.

## Difetti veri trovati

Tre, tutti invisibili a `contrasto.test.js` perché riguardavano coppie mai
dichiarate. Tutti corretti nel Task 6b.

### 1. L'accento del brand usato come colore del testo (49 punti)

`color: var(--accent-green)` compariva in 49 punti. In tema chiaro `#00A884`
come testo dà **2.67:1** su pagina e **2.92:1** su card. Colpiva importi
(`.w-overview__hero-val` 2.68, `.w-overview__split-val` 2.79), i pulsanti di
collegamento del carosello e l'etichetta attiva della navigazione mobile.

`COPPIE` verificava `--accent-on` **sopra** l'accento, mai l'accento **come**
testo.

Corretto con `--accent-text`: `#007A5E` nel chiaro, uguale all'accento nello
scuro — dove era già a 9.63:1, quindi il tema scuro non cambia di un pixel.

### 2. Il vetro annidato (due strati)

`.w-overview__split-label` sta su un riquadro interno dentro una card: due
superfici traslucide sovrapposte. Nel tema scuro ogni strato schiarisce lo
sfondo e `--text-muted` scendeva a **4.29:1**.

Nel tema chiaro il vetro annidato schiarisce e quindi **aiuta** (5.66): lì non
serviva nulla.

### 3. Il vetro a tre strati, e la scelta di tagliare invece di inseguire

I badge del tipo di conto usano `--text-muted` su un **terzo** strato (badge
sopra card sopra pagina): **4.17–4.38:1**.

Progressione misurata: card 5.25 → vetro annidato 4.85 → badge dentro card 4.17.
Ogni strato costa contrasto e non c'è un limite naturale: un quarto strato
fallirebbe di nuovo.

Deciso di alzare `--text-muted` **una volta sola** fino a reggere la pila più
profonda che l'interfaccia usa davvero (`#8A90A8`), invece di rincorrere la
profondità un livello per volta. Il valore è stato scelto **provando i candidati
nel browser sulla pagina vera**: il modello analitico dava 4.64 dove il browser
misurava 4.17, e la differenza sarebbe passata inosservata.

Le superfici `cardAnnidata` e `cardConInserto` sono ora fra quelle dichiarate,
così la classe di difetto non può tornare.

## Esito finale

Audit ripetuto dopo le correzioni. **215 elementi di testo esaminati.**

| Pagina | Elementi | Tema scuro | Tema chiaro |
|---|---|---|---|
| Dashboard | 73 | nessun difetto | nessun difetto |
| Movimenti | 78 | nessun difetto | nessun difetto |
| Conti | 32 | nessun difetto | nessun difetto |
| Impostazioni | 32 | nessun difetto | nessun difetto |

Nessuna casella è stata omessa: "nessun difetto" significa verificato e pulito,
che è diverso da non verificato.

## Difetti preesistenti annotati e non corretti

Nessuno. L'audit non ha trovato difetti attribuibili ai blocchi 1-2 distinti da
quelli che il blocco 5 doveva correggere.

## Cosa resta fuori da questa verifica

- **Zoom al 200% e navigazione da tastiera**: l'audit misura contrasto e
  dimensione, non il riflusso del layout né l'ordine di tabulazione. La
  navigazione da tastiera delle card obiettivo è stata corretta nel Task 5b su
  basi strutturali (un `<button>` nativo al posto di un `div role="button"`),
  ma non è stata percorsa a mano.
- **Screen reader reali** (VoiceOver, TalkBack, NVDA): l'argomento che ha
  portato al Task 5b si basa sul comportamento documentato delle piattaforme e
  sul calcolo del nome accessibile, non su una prova con tecnologia assistiva
  vera.
- Le pagine fuori dalla matrice prescritta: Analisi, Investimenti, Obiettivi,
  Scommesse, Budget, Importa, Aiuto. I difetti trovati erano tutti di token e
  la correzione è globale, quindi il rischio residuo è basso — ma non è
  verificato.
