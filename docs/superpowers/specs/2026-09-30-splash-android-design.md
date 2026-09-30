# Specifica: avvio animato nativo Android di WALLT

**Stato:** implementazione richiesta dall’utente; verifica nativa da completare su Android Studio/dispositivo
**Data:** 30 settembre 2026

## Contesto

Su Android WALLT viene installata da Chrome come PWA. Chrome crea la schermata
iniziale usando nome, colori e icone del manifest e la mantiene fino al primo
disegno della pagina. La PWA non può sostituire quella schermata con
l’animazione HTML/CSS.

Nel frontend esiste già l’animazione WALLT disegnata con SVG e CSS. Dura circa
tre secondi e viene mostrata dopo il primo disegno della pagina. Il manifest
PWA usa gli asset ufficiali correnti. Nel ramo `codex/wallt-ios-splash-auth`
è già presente il contenitore Capacitor iOS, basato su Capacitor 8; non esiste
ancora un target Android.

## Obiettivo

Aggiungere un’app Android nativa Capacitor, mantenendo disponibile la PWA,
affinché l’apertura dell’app Android nativa mostri l’animazione WALLT già
esistente e il relativo suono automatico, senza il grande logo statico che
Chrome visualizza nella splash della PWA.

L’icona ufficiale resta invariata nell’elenco app e nella PWA. La schermata
nativa di avvio usa un segno vettoriale compatto e animato, coordinato con lo
sfondo WALLT, poi cede il controllo all’animazione web completa al primo frame
del WebView. L’animazione completa resta disegnata dal codice, senza immagini.

## Confini

- La PWA installata da Chrome resta disponibile e mantiene la schermata iniziale
  controllata da Chrome. La modifica consente la nuova esperienza solo a chi
  installa l’app Android nativa.
- Gli asset ufficiali del brand e le icone launcher non vengono modificati.
- La schermata di avvio Android non prolunga artificialmente l’apertura: il
  passaggio al WebView avviene al primo frame pronto.
- La pubblicazione su Google Play, la firma di rilascio e l’attivazione di
  credenziali remote non fanno parte della prima build di verifica.
- Le modalità di accesso esistenti non vengono rimosse o indebolite.

## Progetto

### Contenitore Android

- Aggiungere `@capacitor/android` alla stessa versione principale e patch del
  runtime e della CLI già usati dal ramo iOS.
- Generare `client/android` a partire da `capacitor.config.json`, mantenendo
  `com.wallt.app`, `WALLT` e il bundle locale `client/dist`.
- Aggiungere comandi ripetibili per sincronizzare il bundle web e aprire il
  progetto Android. Il normale build Vite e la pubblicazione PWA su Vercel
  restano indipendenti da Android Studio.

### Sequenza visiva

1. Android mostra il colore di sfondo WALLT e un drawable compatto composto
   dal solo segno, senza il grande lockup grafico e la parola WALLT. Su Android
   12 o successivo il segno è un `AnimatedVectorDrawable`; sulle versioni
   supportate precedenti resta statico, poi parte la sequenza web.
2. `MainActivity` mantiene la schermata di sistema fino a
   `onPageCommitVisible` del WebView. Così il passaggio non anticipa il primo
   contenuto renderizzato e l’animazione SVG/CSS già presente in `index.html`
   appare dalla sua fase iniziale, senza essere già avanzata dietro la splash.
   Il tema post-splash usa lo stesso colore di fondo per evitare flash se il
   WebView deve ancora disegnare.
3. La splash web mantiene la durata complessiva attuale di circa tre secondi,
   il supporto a `prefers-reduced-motion` e la transizione senza flash fra
   sfondo nativo e web.
4. L’icona launcher usata da Android resta l’asset ufficiale esistente. Il
   drawable di avvio è una risorsa vettoriale Android separata, non un nuovo
   PNG di brand.

Android controlla l’entrata iniziale della schermata di sistema; il progetto
sostituisce il logo grande con il segno compatto e coordina lo sfondo. La
sequenza SVG/CSS completa inizia quando il WebView è pronto e resta visibile
per circa tre secondi.

### Suono

- L’app Android nativa deve conservare il suono automatico che oggi funziona
  nella PWA Android.
- Estendere il plugin `@wallt/native` con un’implementazione Android del solo
  effetto d’avvio, generata da codice e con le stesse note e gli stessi livelli
  dell’implementazione iOS. Usare una riproduzione nativa breve, evitando di
  dipendere dall’autoplay Web Audio del WebView.
- Il suono non parte quando è attivo `prefers-reduced-motion`; un errore audio
  non deve bloccare l’apertura.
- La PWA conserva il percorso Web Audio corrente.

### Accesso

- Questa modifica non cambia autenticazione, backend, challenge OAuth o
  autorizzazioni: restano i flussi web già presenti.
- La schermata d’avvio può essere verificata separatamente dall’autenticazione.
  Prima di distribuire pubblicamente il pacchetto Android vanno verificati
  Google e Apple nel WebView; se il ritorno OAuth non funziona, l’integrazione
  nativa con Credential Manager e il rientro sicuro tramite browser/deep link
  richiedono un’attività dedicata.

## Verifiche e criteri di accettazione

- I test frontend e la build Vite passano; `npx cap sync android` completa.
- Una build Android debug viene compilata e installata su emulatore o telefono.
- All’avvio a freddo dell’app nativa non compare il grande logo WALLT: la
  schermata nativa usa il segno compatto e passa senza flash all’animazione
  SVG/CSS, che termina in circa tre secondi.
- Il suono parte senza tocco nell’app Android nativa; i flussi di accesso non
  vengono modificati da questa attività.
- Con movimento ridotto non vengono riprodotti animazione o suono d’avvio.
- Il test PWA conferma che icone, manifest, schermata Chrome e animazione web
  restano invariati.
- Nessuna icona ufficiale né immagine usata nell’animazione viene modificata.

## Rischi e prerequisiti

- La schermata Chrome della PWA non può adottare l’animazione e rimane
  invariata. Per vedere il nuovo avvio bisogna installare il pacchetto nativo.
- Android Studio, Android SDK e `adb` non sono installati nell’ambiente attuale;
  la build nativa e la verifica su dispositivo richiederanno tali strumenti o
  una CI Android con un telefono disponibile per il controllo finale.
- La verifica su dispositivo dei ritorni OAuth Google/Apple precede una
  distribuzione pubblica. Pubblicare richiede inoltre firma, account Play e
  revisione.

## Riferimenti tecnici

- [Chrome: splash screen delle PWA](https://web.dev/articles/add-manifest)
- [Capacitor 8: requisiti e piattaforma Android](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Android: SplashScreen API](https://developer.android.com/develop/ui/views/launch/splash-screen)
- [Android: Sign in with Google tramite Credential Manager](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation)
