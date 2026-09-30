# Audio automatico della splash nell’app iOS — specifica

## Obiettivo concordato

All’avvio dell’app WALLT distribuita tramite App Store, il suono sintetizzato
della splash deve partire insieme all’animazione senza richiedere un tocco. Il
suono deve rispettare l’interruttore Silenzioso di iPhone e non interrompere
altra riproduzione audio. L’animazione e il fallback audio della PWA e del web
devono continuare a funzionare come oggi. L’app iOS deve inoltre mantenere
l’accesso degli account Google e offrire l’accesso Apple richiesto dalle linee
guida per le app che usano login sociali. Gli account Apple creati su iOS
devono poter accedere anche alla PWA. Le modifiche locali alle icone e alle
pagine dei conti restano fuori da questo lavoro.

## Stato attuale e vincolo della piattaforma

`client/src/App.vue` avvia `startStartupSplashSound` durante la configurazione
dell’app. `client/src/utils/startupSplashSound.js` sintetizza le note con Web
Audio, ma tenta anche di sbloccarsi tramite un gesto. In una PWA iOS il browser
può impedire l’avvio di audio udibile finché l’utente non interagisce con la
pagina; il codice web non può rimuovere in modo affidabile questo vincolo.

L’host del progetto ha gli strumenti da riga di comando Apple ma non
l’installazione completa di Xcode: la compilazione iOS e la verifica su
simulatore o dispositivo richiederanno Xcode.

## Approcci valutati

1. **Restare solo PWA/Web Audio.** Non garantisce il suono automatico su iPhone;
   non raggiunge il risultato richiesto.
2. **Aggiungere un contenitore iOS Capacitor e un plugin audio nativo Swift.**
   Riutilizza la SPA e la splash esistente, consente la riproduzione all’avvio
   tramite l’audio nativo e lascia intatto il percorso web. È l’approccio scelto.
3. **Riscrivere WALLT come app interamente nativa.** Aumenta molto costi e
   superficie di regressione senza essere necessario per questa funzione; è
   escluso.

## Architettura proposta

- Integrare Capacitor con il bundle Vue locale, senza caricare la UI
  dell’applicazione da un sito remoto. La PWA continuerà a essere compilata e
  distribuita come ora.
- Aggiungere un plugin Capacitor iOS che genera le stesse note già definite in
  `startupSplashSound.js`, usando codice Swift e buffer/oscillatori audio, senza
  file audio, immagini o nuovi effetti visivi. Il plugin non deve bloccare il
  router o la verifica della sessione.
- Configurare `AVAudioSession` nella categoria `.ambient`, così il sistema
  rispetta Silenzioso e consente il mix con l’audio di altre app. Se il sistema
  interrompe o rifiuta l’audio, l’app continua normalmente senza errore visibile.
- Fare in modo che il punto d’ingresso audio scelga il plugin solo nell’app
  iOS nativa; browser e PWA conservano l’implementazione Web Audio attuale.
  L’audio automatico è garantito nell’app nativa; la PWA conserva i limiti di
  autoplay del browser.
- Usare l’SDK ufficiale Google Sign-In per iOS nell’app Capacitor. Il flusso
  attuale Google Identity Services rimane per web/PWA. L’accesso nativo invia
  al backend un ID token Google verificabile e riceve il normale token JWT
  WALLT; non si trasmettono JWT WALLT tramite URL o deep link.
- Implementare “Accedi con Apple” su iOS tramite Authentication Services e
  l’SDK nativo Apple e sul web/PWA tramite Sign in with Apple JS. Non
  disabilitare il login Google su iOS: esistono utenti con account solo Google.
  Entrambe le piattaforme inviano al backend authorization code, ID token,
  nonce e audience della piattaforma. Il backend scambia il code con Apple e
  verifica l’ID token restituito prima di emettere il JWT WALLT tramite risposta
  API, mai tramite URL o deep link.
- Il backend conserva i challenge OAuth in PostgreSQL come valori hashati,
  legati a provider, scopo (login o step-up), utente quando autenticato e
  scadenza. Il consumo è atomico, così un token non può riutilizzarsi su
  istanze Vercel diverse. Il backend verifica nonce, firma, audience e
  scadenza per entrambi i provider prima di emettere il JWT. Verifica inoltre
  `iss` e `sub`; per Google verifica l’email verificata. L’ID Apple (`sub`) viene
  salvato in una colonna univoca dedicata. Il login Google riutilizza
  `resolveGoogleUser` e mantiene esattamente la politica attuale: rifiuta il
  collegamento a un account locale con password, ma conserva il collegamento
  previsto per un account senza password. Il login Apple cerca prima `sub`;
  solo alla prima registrazione usa l’email verificata ricevuta da Apple. Se
  l’email collide con un account esistente, non lo collega automaticamente e
  mostra un messaggio per usare il metodo già collegato. Gli indirizzi relay
  restano riconoscibili tramite `sub`, anche quando Apple non restituisce di
  nuovo l’email.
- Lo step-up Google per le azioni sensibili continua a usare il challenge
  esistente; il client nativo deve firmare il medesimo nonce con l’SDK Google.
  Gli account Apple usano un challenge monouso Apple e la stessa scadenza e
  freschezza dello step-up già previsto. I controller di reset, eliminazione
  ed esportazione non devono accettare un token dello step-up di un altro
  provider.
- Configurare CORS per l’origine locale iOS di Capacitor, senza wildcard e
  senza cambiare le origini web già configurate.

## Requisiti di accettazione

1. Nell’app iOS installata, con Silenzioso disattivato, il suono parte senza
   tocco mentre è visibile la splash; l’avvio non attende la fine del suono.
2. Con Silenzioso attivato, la splash resta silenziosa e l’app è utilizzabile.
3. La riproduzione non interrompe musica o audio di altre app.
4. L’audio web/PWA conserva la logica esistente e non importa codice nativo.
   Login Google web resta invariato; Apple web usa Sign in with Apple JS, così
   un account creato su iOS può accedere anche alla PWA.
5. Login e registrazione Google e Apple producono la stessa sessione e il
   percorso di onboarding su iOS e PWA. Google conserva la regola di
   collegamento già in uso; Apple non si collega per email a un account già
   esistente.
6. Le azioni sensibili per entrambi i provider sociali richiedono step-up;
   nonce scaduti, riutilizzati, con audience errata o appartenenti a un altro
   utente/provider sono rifiutati, anche tra istanze serverless. Il flusso web
   Google resta funzionante e Apple dispone di un flusso di verifica web/iOS
   coerente.
7. Build web e suite backend pertinenti passano. Per accettare la parte iOS
   occorrono inoltre build Xcode, prova su iPhone reale con Silenzioso acceso
   e spento, login Google e Apple, step-up per entrambi, avvio freddo e ritorno
   da background.

## App Store e prerequisiti di rilascio

La regola Apple 3.2.1(viii) menziona le app per gestione del denaro, trading e
investimenti e prevede requisiti sul soggetto che le invia e sulle licenze. La
classificazione concreta di WALLT e l’idoneità del titolare non sono state
confermate. L’invio ad App Store è quindi un gate esterno da chiarire prima
della pubblicazione, non una garanzia di approvazione ottenuta dal solo codice.
Apple valuta inoltre il valore funzionale dell’app e non solo la presenza di un
contenitore web. La regola 4.8 richiede un’opzione equivalente con tutela della
privacy quando si usa Google Sign-In per l’account principale; Sign in with
Apple è l’opzione prevista in questa architettura, salvo che Apple confermi
un’eccezione applicabile a WALLT.

Serviranno anche un Bundle ID definitivo, il client OAuth Google per iOS legato
a quel Bundle ID, la capability Sign in with Apple e un Services ID/dominio per
la PWA nel team Apple, la configurazione backend/CORS e Xcode con firma Apple.
Il backend Apple richiede Team ID, Key ID e chiave privata `.p8`; questa chiave
resta solo in un secret server-side e non entra mai nel bundle client. La
creazione di questi client e capability richiede accesso agli account Google
Cloud e Apple Developer, non presente nel repository. La pubblicazione
richiede anche un’icona App Store ufficiale da 1024×1024; il lavoro sulle
icone resta escluso come richiesto, quindi questo è un prerequisito esterno
alla specifica.

## Confini

Non modificare le icone già committate, l’animazione grafica, il flusso OAuth
web, i dati finanziari o le altre funzioni. Non introdurre Android in questa
fase. Non pubblicare l’app, modificare credenziali o configurazioni remote, né
promettere l’approvazione Apple.

## Fonti tecniche

- [Policy di autoplay WebKit su iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/)
- [Capacitor — runtime e plugin nativi](https://capacitorjs.com/docs)
- [Apple — gesti richiesti da WKWebView per la riproduzione](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/mediatypesrequiringuseractionforplayback)
- [Apple — comportamento della categoria audio `ambient`](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient)
- [Google — policy e SDK Sign-In nativo iOS](https://developers.google.com/identity/siwg/best-practices)
- [Google — integrazione Sign-In iOS e autenticazione backend](https://developers.google.com/identity/sign-in/ios/start-integrating)
- [Linee guida Apple App Review — 3.2.1 e 4.8](https://developer.apple.com/app-store/review/guidelines/it/)
- [Apple — autenticazione con Sign in with Apple](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple)
- [Apple — verifica dell’utente e scambio dell’authorization code](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)
- [Apple — linee guida Sign in with Apple per app e siti](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/)
