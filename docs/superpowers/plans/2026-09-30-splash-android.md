# Avvio animato Android — Piano di implementazione

> **Per agenti di coding:** usare `superpowers:executing-plans` e completare le attività una alla volta. Ogni attività termina con una verifica indipendente.

**Obiettivo:** fornire a WALLT un pacchetto Android nativo il cui avvio non mostri il grande logo statico di Chrome e passi senza interruzioni all’animazione SVG/CSS già esistente, mantenendo il suono automatico.

**Architettura:** aggiungere Android a Capacitor 8 e configurare la schermata di sistema con sfondo coordinato e un segno vettoriale compatto, animato sui sistemi che supportano le splash animate. Al primo frame del WebView la schermata nativa cede all’animazione web esistente; il plugin `@wallt/native` riproduce il suono con il codice nativo Android. La PWA e le sue icone restano invariate.

**Stack:** Vue 3, Vite, Capacitor 8, Android SplashScreen API, Kotlin/Java e test Node.js integrati.

**Spec:** `docs/superpowers/specs/2026-09-30-splash-android-design.md`

## Vincoli globali

- Tutti i testi, commenti e documenti sono in italiano; gli identificatori del codice restano in inglese.
- Android mantiene `com.wallt.app`, `WALLT` e `client/dist` come bundle locale.
- Il manifest PWA e gli asset ufficiali del brand restano invariati; le risorse launcher del nuovo target Android derivano dagli asset ufficiali già presenti senza modificarne il disegno.
- L’animazione completa resta disegnata in SVG/CSS; non si usano immagini per la sequenza.
- Il suono nativo Android usa le note già definite in `startupSplashSound.js`, parte senza gesto e non blocca l’avvio in caso di errore.
- `prefers-reduced-motion` disattiva animazione e suono d’avvio.
- La PWA continua a usare Web Audio e conserva la schermata controllata da Chrome.
- Non cambiare API, autenticazione o dati finanziari per risolvere la schermata d’avvio.

## Messa a fuoco della revisione

- Android 12+ riceve il drawable animato compatto; Android 7–11 riceve una risorsa vettoriale statica compatta e avvia comunque l’animazione web.
- Avvio nativo lento o bundle non ancora pronto: la schermata di sistema resta visibile fino a `onPageCommitVisible` del WebView; il tema successivo mantiene lo sfondo coordinato.
- Movimento ridotto: la splash web termina rapidamente e il plugin non riproduce audio.
- Audio nativo non disponibile o rifiutato dal dispositivo: l’app continua ad avviarsi e i gestori audio non restano attivi.
- Browser/PWA: la piattaforma `web` continua a non delegare a Capacitor e a rispettare lo sblocco Web Audio già implementato.

## Mappa dei file

- `client/package.json`, `client/package-lock.json`: dipendenza `@capacitor/android` allineata a Capacitor 8 e comandi `cap:sync:android` / `cap:open:android`.
- `client/android/`: progetto Android generato da Capacitor, ID applicazione esistente, tema di avvio e risorse vettoriali compatte; le icone launcher Android sono generate dagli asset ufficiali `icon-192x192.png` e `icon-maskable-512x512.png`.
- `client/plugins/wallt-native/package.json`: inclusione dei sorgenti Android nel pacchetto plugin locale.
- `client/plugins/wallt-native/android/build.gradle`, `client/plugins/wallt-native/android/src/main/AndroidManifest.xml`, `client/plugins/wallt-native/android/src/main/java/com/wallt/nativeplugin/WalltNativePlugin.java`: registrazione del plugin e sintesi dell’effetto tramite API audio Android.
- `client/src/utils/startupSplashSound.js`: selezione del plugin nativo anche per Android, mantenendo invariati i percorsi iOS e web.
- `client/tests/startupSplashSound.test.js`: verifica che Android usi il plugin senza gesto, che movimento ridotto sopprima il suono e che il web continui a usare Web Audio.
- `client/tests/androidSplashResources.test.js`: verifica il vettore statico, l’AnimatedVectorDrawable API 31+, il rilascio della SplashScreen API al commit visibile del WebView, lo sfondo del tema successivo, la rimozione delle vecchie immagini splash e l’uso dell’icona launcher separata.
- `docs/PROJECT_STATUS.md` e `README.md`: istruzioni per sincronizzare ed eseguire l’app Android e distinzione esplicita tra installazione PWA e pacchetto nativo.

## Interfacce

- Il plugin espone `WalltNative.playStartupSound({ notes, masterVolume }) -> Promise<{ started: boolean }>` su Android, come già su iOS.
- `startStartupSplashSound({ getPlatform, nativePlugin, createAudioContext, eventTarget, unlockWindowMs })` delega sia `ios` sia `android` al plugin e mantiene Web Audio per `web`.
- Il tema Android usa una risorsa separata `wallt_splash_mark`, composta dal solo segno vettoriale; l’icona launcher ufficiale non è referenziata dalla schermata di avvio.
- La schermata di sistema si rimuove al primo commit visibile del WebView, registrato prima del caricamento; non si aggiunge un timer fisso di attesa del bundle.

## Attività

### Attività 1: aggiungere il target Android Capacitor

**File:**
- Modifica `client/package.json` e `client/package-lock.json`.
- Crea il progetto `client/android/` con `npx cap add android`.
- Modifica `client/capacitor.config.json` solo se richiesto dal template Capacitor per una configurazione esplicita della splash.

**Interfacce:** il progetto Android usa Capacitor `8.5.2`, `appId: com.wallt.app`, `appName: WALLT` e `webDir: dist`.

- [x] **Passo 1: aggiungere la verifica di coerenza Android.** In `client/tests/capacitorAndroidConfig.test.js`, leggi `capacitor.config.json` e `package.json`; verifica che `@capacitor/core`, `@capacitor/cli` e `@capacitor/android` abbiano la stessa versione principale e che l’ID app rimanga `com.wallt.app`.
- [x] **Passo 2: eseguire il test e verificare il fallimento.** Da `client/`, esegui `node --test tests/capacitorAndroidConfig.test.js`; il test deve fallire perché Android non è ancora dichiarato.
- [x] **Passo 3: aggiungere piattaforma e comandi.** Aggiungi `@capacitor/android` alla stessa versione del core; aggiungi gli script `cap:sync:android` (`npm run build && cap sync android`) e `cap:open:android` (`cap open android`); aggiorna lockfile e crea `client/android` con Capacitor.
- [x] **Passo 4: eseguire il test e sincronizzare.** Esegui `node --test tests/capacitorAndroidConfig.test.js`, poi `npm run cap:sync:android`; entrambi devono terminare con successo e l’output deve contenere l’ID app atteso.

### Attività 2: eliminare il logo gigante dalla splash nativa

**File:**
- Modifica `client/android/app/src/main/res/values/styles.xml` e i temi specifici per API versionati generati da Capacitor.
- Crea `client/android/app/src/main/res/drawable/wallt_splash_mark.xml`.
- Crea `client/android/app/src/main/res/drawable-v31/wallt_splash_mark.xml` e le risorse animate vettoriali referenziate.
- Crea `client/android/app/src/main/res/values/colors.xml`.
- Modifica `client/android/app/src/main/java/com/wallt/app/MainActivity.java` per installare `SplashScreen` prima di `super.onCreate`.
- Rigenera i PNG launcher Android nelle cinque densità partendo dagli asset ufficiali esistenti; i sorgenti `client/public/icon-192x192.png` e `client/public/icon-maskable-512x512.png` restano identici.

**Interfacce:** `windowSplashScreenAnimatedIcon` punta al solo segno WALLT. Android 12+ usa l’AnimatedVectorDrawable; Android 7–11 usa il vettore statico della stessa forma e colore. Il tema post-splash ripristina il tema WebView.

- [x] **Passo 1: aggiungere un controllo sorgente dei temi.** Crea `client/tests/androidSplashResources.test.js`; verifica che il tema di avvio referenzi `wallt_splash_mark`, abbia un colore di sfondo WALLT, e non referenzi `ic_launcher`, `wallt-app-icon` o `wallt-logo-horizontal`.
- [x] **Passo 2: verificare che il controllo fallisca.** Esegui `npm test -- --test-name-pattern='splash Android'`; il test fallisce finché il target Android non ha risorse di avvio dedicate.
- [x] **Passo 3: configurare la schermata di sistema.** Imposta il segno vettoriale compatto e sfondo coerente nei temi; per API 31+ anima solo proprietà compatibili del gruppo (scala, rotazione lieve o opacità) senza morph del tracciato; per API precedenti usa il vettore statico.
- [x] **Passo 4: verificare le risorse.** Esegui il test mirato; controlla che i riferimenti XML risolvano, che il launcher Android mostri l’asset ufficiale e che il manifest PWA non cambi.

### Attività 3: avviare subito l’animazione web al primo frame

**File:**
- Modifica `client/src/App.vue` e `client/src/utils/startupSplash.js` solo se la verifica mostra una fase già avanzata o un flash tra tema nativo e tema web.
- Verifica `client/tests/startupSplash.test.js`, già presente, senza duplicare l’algoritmo temporale esistente.

**Interfacce:** il timer web continua a misurare circa 2.75 s di animazione più 250 ms di uscita dal primo setup dell’app. Il sistema nativo si nasconde quando il primo contenuto del WebView è stato committato e non attende tre secondi aggiuntivi.

- [x] **Passo 1: verificare il comportamento temporale esistente.** Il test `startupSplash.test.js` copre avvio iniziale, 700 ms trascorsi, caricamento oltre durata e movimento ridotto; eseguilo prima di modificare il collegamento nativo.
- [x] **Passo 2: controllare il primo frame nativo.** Esegui `node --test tests/androidSplashResources.test.js`; il test deve fallire finché `MainActivity` non installa la SplashScreen API prima del WebView.
- [x] **Passo 3: allineare il primo frame.** Mantieni la splash con `setKeepOnScreenCondition` fino a `onPageCommitVisible`, registra il listener prima di avviare il bridge e applica il colore coerente al tema post-splash. Il tema di lancio lascia intatto il drawable composito compatibile con Android precedenti alla versione 12.
- [x] **Passo 4: rieseguire i test mirati.** Esegui `node --test tests/startupSplash.test.js tests/androidSplashResources.test.js`; entrambi devono confermare la durata totale web corrente, l’uscita ridotta e la chiusura nativa senza un timer artificiale.

### Attività 4: riprodurre il suono con il plugin Android

**File:**
- Modifica `client/plugins/wallt-native/package.json`.
- Crea `client/plugins/wallt-native/android/build.gradle` e `client/plugins/wallt-native/android/src/main/AndroidManifest.xml`.
- Crea `client/plugins/wallt-native/android/src/main/java/com/wallt/nativeplugin/WalltNativePlugin.java` e l’eventuale helper puro per generare i campioni.
- Modifica `client/src/utils/startupSplashSound.js` e `client/tests/startupSplashSound.test.js`.

**Interfacce:** `playStartupSound` valida 1–8 note, frequenza 50–5000 Hz, ritardo 0–3000 ms, durata 20–5000 ms e volume 0–1; genera toni sinusoidali con inviluppo morbido e volume master clampato a 0–1. Al completamento libera `AudioTrack`; l’errore restituisce `started: false` o rifiuta la Promise senza interrompere l’avvio.

- [x] **Passo 1: scrivere i test JavaScript che fissano la delega.** Estendi `startupSplashSound.test.js`: su `android` verifica una chiamata singola al plugin con le stesse note e master volume, zero creazioni di `AudioContext` e zero listener di gesto; su `ios` verifica che la delega esistente resti identica; su `web` verifica che plugin non venga chiamato; verifica anche che `unlockWindowMs <= 0` non invochi il plugin.
- [x] **Passo 2: confermare il fallimento.** Esegui `npm test -- --test-name-pattern='plugin nativo Android|plugin audio iOS|browser continua'`; i nuovi casi Android devono fallire sul comportamento attuale.
- [x] **Passo 3: implementare la delega e il plugin.** Per `ios` e `android`, invoca il plugin prima di creare `AudioContext`. In Android sintetizza le note usando `AudioTrack` in modalità streaming e PCM mono 44.1 kHz, applicando fade-in/fade-out per ciascuna nota, volume master e pulizia del thread/track anche su interruzione o errore.
- [x] **Passo 4: verificare il plugin.** Esegui il test JavaScript mirato; compila almeno il modulo plugin con Gradle quando l’SDK sarà disponibile. Se non è disponibile, esegui controlli statici XML/Java e segnala chiaramente che la compilazione Android non è verificata.

### Attività 5: documentare installazione e verificare la regressione PWA

**File:**
- Modifica `README.md`.
- Modifica `docs/PROJECT_STATUS.md` nella sezione piattaforme/deployment.
- Modifica `client/tests/capacitorAndroidConfig.test.js` e `client/tests/androidSplashResources.test.js` solo per fissare comportamenti di PWA separati dal native.

**Interfacce:** la guida distingue l’app PWA installata da Chrome (splash gestita dal browser) dal pacchetto Capacitor Android (splash personalizzata). Comandi documentati: `npm run cap:sync:android` e `npm run cap:open:android` da `client/`.

- [x] **Passo 1: verificare che i test proteggano la PWA.** Aggiungi controlli che `manifest.webmanifest` mantenga gli asset iconici ufficiali e `startupSplashSound.js` continui a selezionare Web Audio su `web`.
- [x] **Passo 2: aggiornare la documentazione.** Spiega in italiano come preparare e avviare il target nativo; esplicita che aggiornare il sito PWA non cambia la splash generata da Chrome e che il nuovo avvio si vede solo installando il pacchetto Android nativo.
- [x] **Passo 3: eseguire le verifiche disponibili.** Da `client/`, esegui `npm test` e `npm run build`; esegui `npm run cap:sync:android`. Se Android Studio/SDK non è disponibile, registra la limitazione e non dichiarare verificata la build su emulatore.
- [x] **Passo 4: rivedere il diff e integrare.** Verifica che `git diff --check` sia pulito, che gli asset ufficiali sorgente PWA/brand siano invariati e che le nuove icone Android derivino dai master esistenti; limita i file modificati al target Android, plugin audio, test e documentazione pertinenti.

## Criteri finali

- Il target nativo Android non mostra il grande wordmark o l’icona launcher nella schermata di sistema.
- Android 12+ mostra il segno vettoriale compatto animato; Android 7–11 mostra quello statico prima dell’animazione web.
- La sequenza SVG/CSS mantiene circa tre secondi totali, parte dal primo frame utile e non ha flash evidente.
- Il suono nativo parte senza interazione; movimento ridotto ed errori audio non riproducono il suono e non bloccano l’app.
- La PWA conserva icone, splash Chrome e percorso sonoro correnti.
- La modifica è committata e pushata sul ramo di lavoro dopo le verifiche disponibili.
