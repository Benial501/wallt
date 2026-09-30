# Audio automatico e app iOS WALLT — piano di implementazione

> **Per chi implementa:** SUB-SKILL RICHIESTA: usare `superpowers:executing-plans` ed eseguire il piano attività per attività.

**Obiettivo:** distribuire WALLT come app iOS con splash audio automatica, mantenendo accesso Google, aggiungendo accesso Apple conforme per iOS e PWA e preservando la sicurezza delle azioni sensibili.

**Architettura:** Capacitor 8 carica il bundle Vue locale; un plugin Swift sintetizza il suono con `AVAudioSession.Category.ambient`. Google Sign-In nativo e Sign in with Apple nativo/web ottengono credenziali verificabili; il backend le scambia o verifica e rilascia l’attuale JWT WALLT. PostgreSQL conserva challenge hashati e ne consuma uno solo con aggiornamento atomico.

**Stack:** Vue 3, Vite, Capacitor 8, Swift, Google Sign-In iOS SDK, Authentication Services, Sign in with Apple JS, Express 5, Sequelize, PostgreSQL, `google-auth-library`, `jose`.

**Specifica:** `docs/superpowers/specs/2026-09-30-audio-splash-ios-design.md`

## Vincoli globali

- Usare un contenitore Capacitor con bundle Vue locale; non caricare l’interfaccia da un sito remoto.
- Generare il suono in codice Swift, senza asset audio, immagini o nuovi effetti visivi.
- Usare `AVAudioSession` nella categoria `.ambient`; Silenzioso sopprime il suono e la riproduzione si miscela con quella delle altre app.
- Web Audio/PWA conserva il comportamento esistente e i limiti di autoplay del browser.
- Accesso Google web conserva Passport e Google Identity Services esistenti.
- La verifica backend Apple controlla authorization code, ID token, nonce, firma, audience, `iss`, `sub`, scadenza e email verificata alla prima registrazione.
- Gli ID Apple sono univoci; un account Apple non si collega a un account esistente per la sola email.
- Challenge hashati in PostgreSQL si legano a provider, scopo, utente quando autenticato e scadenza; il consumo è atomico tra istanze Vercel.
- Non trasmettere JWT WALLT in URL o deep link e non inserire chiavi private nel bundle client.
- Non modificare le icone già committate, l’animazione grafica, i dati finanziari o i flussi web Google non coinvolti.
- Non introdurre il target Android.

## Aree di revisione

1. **Avvio iOS senza gesto o plugin disponibile:** il plugin parte mentre la splash è visibile; un errore nativo non blocca router, sessione o schermata.
2. **Silenzioso, interruzioni e audio concorrente:** `.ambient` silenzia correttamente il suono e non interrompe musica; verificare su iPhone reale.
3. **Replay e concorrenza serverless:** un challenge scaduto, riutilizzato o consumato in parallelo produce al massimo un’autenticazione; i test devono usare la persistenza condivisa.
4. **Apple relay e dati restituiti solo al primo accesso:** gli accessi successivi usano `apple_id` anche senza nome o user object; un’email già registrata non causa auto-link.
5. **Audience e provider errati:** token Google per iOS, Apple per bundle ID o Services ID, token cross-provider e nonce di un altro utente vengono rifiutati.
6. **PWA e browser:** nessun import del plugin nativo, Google web invariato e Apple web attivo solo con configurazione valida.

---

### Task 1: Isolare il ramo e aggiungere il contenitore Capacitor

**File:**
- Creare: `client/capacitor.config.json`
- Modificare: `client/package.json`, `client/package-lock.json`
- Creare con Capacitor: `client/ios/`
- Modificare: `docs/DEPLOY_VERCEL_SUPABASE.md`, `client/.env.example`
- Test: `client/tests/capacitorConfig.test.js`

**Interfacce:**
- Produce una configurazione Capacitor che serve la build locale da `dist`, usa il nome WALLT e imposta l’identificatore iniziale `com.wallt.app`.
- Produce script ripetibili `cap:sync:ios` e `cap:open:ios`; la compilazione ordinaria Vite/PWA non dipende da Xcode.

- [x] **Passo 1: creare un ramo senza il commit locale delle icone**

  Creare `codex/wallt-ios-splash-auth` partendo da `origin/main`. Tenere intatto il ramo locale `main` con il commit icone e non portarlo nel ramo di lavoro. Aggiungere a questo ramo solo la specifica e il piano approvati.

- [x] **Passo 2: bloccare la configurazione base in un test**

```js
test('Capacitor usa il bundle locale e identifica WALLT', async () => {
  const config = JSON.parse(await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appId, 'com.wallt.app');
  assert.equal(config.appName, 'WALLT');
  assert.equal(config.webDir, 'dist');
  assert.equal(config.server, undefined);
});
```

- [x] **Passo 3: eseguire il test per verificare il fallimento**

  Eseguire `cd client && node --test tests/capacitorConfig.test.js`. Atteso: fallimento perché il file di configurazione non esiste.

- [x] **Passo 4: aggiungere Capacitor 8 senza aggiornare Vite o Vue**

  Installare `@capacitor/core`, `@capacitor/ios` e `@capacitor/cli` alla major 8. Aggiungere in `client/package.json` `cap:sync:ios: "npm run build && cap sync ios"` e `cap:open:ios: "cap open ios"`. Creare `client/capacitor.config.json` con `appId`, `appName` e `webDir: "dist"`; non aggiungere `server.url`.

- [x] **Passo 5: generare il progetto iOS con Swift Package Manager**

  Da `client/`, eseguire `npx cap add ios --packagemanager SPM` una sola volta e poi `npm run build && npx cap sync ios`. Tenere sotto controllo versione i file `client/ios/` necessari alla build; non editare il package Capacitor generato `client/ios/CapApp-SPM/Package.swift`.

- [x] **Passo 6: verificare configurazione e build web**

  Eseguire `node --test tests/capacitorConfig.test.js` e `npm run build` in `client/`. Atteso: PASS e build Vite completa senza richiedere un runtime nativo.

- [x] **Passo 7: registrare il contenitore**

  Creare il commit italiano `Aggiunge il contenitore iOS Capacitor`. Non includere asset o modifiche alle icone.

### Task 2: Suono sintetizzato nativo collegato alla splash

**File:**
- Modificare: `client/src/utils/startupSplashSound.js`, `client/src/App.vue`
- Creare: `client/plugins/wallt-native/package.json`, `client/plugins/wallt-native/Package.swift`, `client/plugins/wallt-native/index.js`, `client/plugins/wallt-native/web.js`
- Creare: `client/plugins/wallt-native/ios/Sources/WalltNativePlugin/WalltNativePlugin.swift`
- Modificare: `client/package.json`, `client/package-lock.json`
- Test: `client/tests/startupSplashSound.test.js`

**Interfacce:**
- Il bridge JavaScript espone `WalltNative.playStartupSound({ notes, masterVolume }): Promise<{ started: boolean }>`.
- `startStartupSplashSound()` usa il bridge solo quando `Capacitor.getPlatform() === 'ios'`; su web esegue il codice Web Audio esistente.

- [ ] **Passo 1: aggiungere test del dispatch nativo e fallback web**

  Estendere `startupSplashSound.test.js` con dipendenze iniettabili per piattaforma e plugin. Il test iOS deve affermare una chiamata a `playStartupSound` senza invocare `addEventListener`; il test web deve continuare a chiamare Web Audio e ad aggiungere i listener di gesto.

- [ ] **Passo 2: verificare che i nuovi test falliscano**

  Eseguire `cd client && node --test tests/startupSplashSound.test.js`. Atteso: i casi iOS falliscono perché non esiste il dispatch nativo.

- [ ] **Passo 3: creare un plugin Capacitor locale con implementazione web neutra**

  Aggiungere il package locale `@wallt/native`, dichiarare la sorgente iOS nel metadato `capacitor`, esportare `registerPlugin('WalltNative')` e fornire in `web.js` un metodo che risolve `{ started: false }`. Collegare il package con dipendenza `file:plugins/wallt-native` e sincronizzare Capacitor.

- [ ] **Passo 4: sintetizzare la melodia in Swift**

  In `WalltNativePlugin.swift`, implementare `CAPBridgedPlugin` e `playStartupSound`. Generare buffer PCM per le note ricevute, con inviluppo d’attacco/rilascio e volume master limitato a `[0, 1]`; usare `AVAudioEngine`/`AVAudioPlayerNode`, senza file audio. Configurare `AVAudioSession.sharedInstance().setCategory(.ambient)` e mescolare l’audio. Risolvere la chiamata appena la riproduzione è stata avviata; gli errori restituiscono un rifiuto al bridge ma non devono propagarsi all’app.

- [ ] **Passo 5: collegare l’avvio alla splash senza attese**

  In `startupSplashSound.js`, verificare piattaforma e disponibilità plugin, inviare `STARTUP_SPLASH_SOUND_NOTES` e il volume esistente, gestire il rifiuto con un catch silenzioso e non creare `AudioContext` su iOS nativo. In `App.vue`, conservare timing e cleanup attuali.

- [ ] **Passo 6: verificare suite audio e build web**

  Eseguire `node --test tests/startupSplashSound.test.js`, `node --test tests/startupSplash.test.js` e `npm run build` in `client/`. Atteso: tutti PASS; la PWA non deve importare un framework nativo a runtime.

- [ ] **Passo 7: registrare l’audio iOS**

  Creare il commit italiano `Riproduce la melodia della splash con audio iOS nativo`.

### Task 3: Challenge persistenti e accesso Google/Apple nel backend

**File:**
- Creare: `server/models/OAuthChallenge.js`, `server/services/oauthChallenge.service.js`, `server/services/googleNativeAuth.service.js`, `server/services/appleAuth.service.js`, `server/controllers/nativeOAuth.controller.js`, `server/migrations/20260930-add-native-oauth.js`
- Modificare: `server/models/User.js`, `server/models/index.js`, `server/routes/auth.routes.js`, `server/app.js`, `server/middleware/validation.middleware.js`, `server/config/validateEnv.js`, `server/.env.example`, `server/services/googleStepUp.service.js`, `server/controllers/googleStepUp.controller.js`, `server/controllers/impostazioni.controller.js`
- Test: `server/tests/nativeOAuth.test.js`, `server/tests/googleStepUp.test.js`, `server/tests/validateEnv.test.js`, `server/tests/migrations.postgres.test.js`

**Interfacce:**
- `POST /api/auth/google/native/challenge` → `{ nonce, challenge, expires_in }`.
- `POST /api/auth/google/native/verify` con `{ credential, challenge, use_ai_categorization }` → `{ token, onboarding, user }`.
- `POST /api/auth/apple/challenge` con `{ platform }` → `{ nonce, challenge, expires_in }`.
- `POST /api/auth/apple/verify` con `{ platform, credential, authorization_code, challenge, name }` → `{ token, onboarding, user }`.
- Per step-up Apple: `POST /api/auth/apple/step-up/challenge` e `POST /api/auth/apple/step-up/verify`; per Google usare il flusso esistente dopo aver spostato il consumo challenge su PostgreSQL.
- `OAuthChallenge` memorizza `challenge_hash`, `nonce_hash`, `provider`, `purpose`, `platform`, `user_id`, `expires_at`, `consumed_at`; non conserva i challenge in chiaro.

- [ ] **Passo 1: testare challenge hashati e consumo atomico**

  Aggiungere test di servizio per scadenza, provider/scopo/utente diversi, riuso dopo consumo e due richieste concorrenti che tentano il consumo. Verificare che al massimo una richiesta ottenga `consumed: true` e che nessun valore grezzo del challenge sia persistito.

- [ ] **Passo 2: eseguire i test mirati per verificare il fallimento**

  Eseguire `cd server && npx jest tests/nativeOAuth.test.js --runInBand`. Atteso: fallimento per modello e servizio mancanti.

- [ ] **Passo 3: aggiungere modello, migrazione e servizio atomico**

  Aggiungere `OAuthChallenge` e la migrazione con indici univoci sul digest, lookup per scadenza e foreign key `user_id` nullable. Implementare challenge casuali base64url, digest SHA-256, TTL di 120 secondi e consumo in transazione tramite `UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW()`; cancellare i record scaduti quando si genera un nuovo challenge.

- [ ] **Passo 4: verificare Google nativo usando il client OAuth server già esistente**

  Verificare ID token con `google-auth-library`, audience `GOOGLE_CLIENT_ID`, nonce del challenge, firma, issuer, freschezza di 120 secondi e `email_verified`. Convertire i claim verificati nel profilo richiesto da `resolveGoogleUser`, mantenendo la regola di collegamento attuale, poi generare il JWT con `generateToken` e restituire `formatUser`/onboarding.

- [ ] **Passo 5: testare Apple code exchange, identità e collisioni**

  Mockare JWKS e `fetch` Apple. Coprire code scaduto/riutilizzato, audience errata, firma, issuer, nonce, `sub`, email non verificata alla prima registrazione, login successivo tramite `apple_id` senza user object, collisione email e token Apple errato per la piattaforma. Il client secret Apple va firmato ES256 con `APPLE_TEAM_ID`, `APPLE_KEY_ID` e `APPLE_PRIVATE_KEY`; il code va scambiato su `https://appleid.apple.com/auth/token`; verificare il JWT restituito usando `jose` e le chiavi pubbliche Apple.

- [ ] **Passo 6: aggiungere identità Apple e configurazione controllata**

  Aggiungere `apple_id` univoco a modello e migrazione; includere `apple` tra i valori `auth_provider`. Implementare `resolveAppleUser`: prima ricerca per `sub`; al primo accesso richiedere email verificata; rifiutare collisioni con email esistente senza collegamento automatico; usare il nome solo come profilo, mai come prova d’identità. Validare la configurazione opzionale completa Apple (`APPLE_CLIENT_ID`, `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) senza stampare i valori. Riutilizzare il messaggio password-reset Apple già presente.

- [ ] **Passo 7: aggiungere route, validazione e rate limit**

  Registrare endpoint challenge/verify Google e Apple con validazione `express-validator`. Applicare `authLimiter` ai challenge pubblici e `stepUpLimiter` ai challenge autenticati/verifiche; le verifiche login non devono richiedere JWT preesistente. Aggiornare `/providers` per segnalare Apple soltanto se la configurazione server necessaria è completa.

- [ ] **Passo 8: portare lo step-up Google su storage condiviso e aggiungere Apple**

  Modificare `googleStepUp.service.js` per creare e consumare `OAuthChallenge` con provider Google, scopo `step_up` e `user_id`. Aggiungere verifica Apple con la stessa freschezza, binding utente/provider, scambio code e challenge monouso. Selezionare il metodo in `ImpostazioniView` tramite provider JWT; password locale conserva la verifica bcrypt. Nessuna conferma testuale sostituisce lo step-up.

- [ ] **Passo 9: aggiornare i test di sicurezza e migrazione**

  Eseguire i test mirati `googleStepUp.test.js`, `validateEnv.test.js` e `migrations.postgres.test.js` con `TEST_DATABASE_URL`/`DB_NAME_TEST=wallt_test`. Atteso: challenge concorrenti consumati una sola volta; audience o provider incrociati respinti; migrazione presente nel database di test; configurazione server Apple incompleta rifiutata senza rivelare valori.

- [ ] **Passo 10: registrare il backend OAuth**

  Creare il commit italiano `Aggiunge accesso Apple e challenge OAuth persistenti`.

### Task 4: Accesso Apple/Google nativo, accesso Apple web e step-up UI

**File:**
- Creare: `client/src/utils/nativeOAuth.js`, `client/src/composables/useAppleAuth.js`, `client/src/composables/useNativeGoogleAuth.js`, `client/src/composables/useAppleStepUp.js`
- Modificare: `client/plugins/wallt-native/Package.swift`, `client/plugins/wallt-native/ios/Sources/WalltNativePlugin/WalltNativePlugin.swift`, `client/src/composables/useOAuthPopup.js`, `client/src/composables/useGoogleStepUp.js`, `client/src/views/auth/LoginView.vue`, `client/src/views/auth/RegisterView.vue`, `client/src/views/ImpostazioniView.vue`, `client/.env.example`, `client/index.html`
- Test: `client/tests/oauthPopup.test.js`, `client/tests/nativeOAuth.test.js`, `client/tests/appleAuth.test.js`, `client/tests/googleStepUp.test.js`

**Interfacce:**
- `WalltNative.signInGoogle({ nonce }): Promise<{ credential: string }>` usa `serverClientID = VITE_GOOGLE_CLIENT_ID`.
- `WalltNative.signInApple({ nonce }): Promise<{ credential: string, authorizationCode: string, name?: string }>` restituisce token e codice in base64url.
- `completeOAuthLogin(token, user)` resta l’unico ingresso nella sessione Pinia.
- Google web continua con `useOAuthPopup`; Apple web usa Apple JS con Services ID, redirect URL registrato, `state` e nonce dal backend.

- [ ] **Passo 1: scrivere test per i client di scambio token**

  Testare `nativeOAuth.js` con richieste mockate: ogni provider deve inviare challenge e credential; errori/cancel Google o Apple non devono chiamare `completeOAuthLogin`; successo deve passare il JWT WALLT ricevuto allo store.

- [ ] **Passo 2: implementare il bridge Google Sign-In iOS**

  Aggiungere Google Sign-In iOS SDK `9.0.0` come dipendenza Swift Package, configurare URL scheme dal client ID iOS pubblico e inoltrare URL callback prima del fallback `ApplicationDelegateProxy` in `AppDelegate.swift`. Usare `GOOGLE_CLIENT_ID` web come server client ID per emettere credential con audience verificabile dal backend.

- [ ] **Passo 3: implementare il bridge Sign in with Apple iOS**

  Aggiungere Authentication Services nel plugin, creare una richiesta con scope email/name e nonce challenge, restituire `identityToken`, `authorizationCode` e nome ricevuto al primo accesso. Aggiungere la capability e configurare il Bundle ID. Gestire annullamento e token mancanti come errori localizzati dal client.

- [ ] **Passo 4: implementare il client web Apple**

  Caricare Apple JS solo quando `APPLE_SERVICE_ID` e redirect URL sono configurati. Chiedere un challenge al backend prima di `AppleID.auth.signIn()`, impostare state/nonce, inviare authorization code e ID token al backend, quindi completare sessione/onboarding con lo stesso store. Rimuovere listener e stato anche su annullamento.

- [ ] **Passo 5: integrare login e registrazione**

  Aggiungere provider Apple con pulsante conforme alle linee Apple in `LoginView.vue` e `RegisterView.vue`; mostrare Apple solo quando provider disponibile. In iOS instradare Google/Apple al bridge; nel browser mantenere Google popup esistente e usare Apple JS. Riutilizzare messaggi errore italiani per collisioni email e provider non configurato.

- [ ] **Passo 6: integrare step-up in Impostazioni**

  Mantenere Google Identity Services sul web. In iOS chiamare Google Sign-In con nonce del challenge; per Apple richiedere e verificare challenge Apple sia su web che iOS. Il modal continua a eseguire reset, eliminazione o export solo con `step_up_token` valido.

- [ ] **Passo 7: testare fallback e route esistente**

  Eseguire `node --test tests/nativeOAuth.test.js`, `node --test tests/appleAuth.test.js`, `node --test tests/googleStepUp.test.js` e `node --test tests/oauthPopup.test.js` in `client/`. Atteso: Apple login è nascosto senza configurazione, PWA non carica plugin nativi e Google OAuth web non cambia comportamento.

- [ ] **Passo 8: registrare i flussi client**

  Creare il commit italiano `Integra accesso Apple e Google nell’app iOS`.

### Task 5: Configurazione, verifica completa e limiti del rilascio

**File:**
- Modificare: `docs/API.md`, `docs/SECURITY.md`, `docs/DEPLOY_VERCEL_SUPABASE.md`, `server/.env.example`, `client/.env.example`, `.gitignore`
- Test: `server/tests/corsMetodi.test.js`, suite `client/tests/`, suite backend

- [ ] **Passo 1: consentire solo l’origine Capacitor prevista**

  Aggiornare `server/app.js` per includere l’origine esatta `capacitor://localhost` alla allowlist CORS esistente, senza `*`, mantenendo credential, metodi e header attuali. Aggiungere test `OPTIONS` che verifica l’origine Capacitor consentita e una seconda origine arbitraria respinta.

- [ ] **Passo 2: documentare variabili e setup account esterni**

  Documentare `VITE_GOOGLE_IOS_CLIENT_ID`, `VITE_APPLE_SERVICE_ID`, `VITE_APPLE_REDIRECT_URI`, `APPLE_CLIENT_ID`, `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` e `APPLE_PRIVATE_KEY`; specificare quali sono pubblici e quali server-only. Documentare Bundle ID e capability Apple, dominio/return URL, client OAuth Google, origine CORS e migrazione. Non inserire credenziali reali nei file.

- [ ] **Passo 3: controllare esclusioni locali**

  Aggiungere `.env` iOS e file di firma/certificati a `.gitignore`; verificare che `.p8`, provisioning profile, chiavi e token non entrino nel diff. Verificare che i file icona preesistenti non compaiano tra le modifiche.

- [ ] **Passo 4: eseguire tutte le verifiche ripetibili disponibili**

  Eseguire `cd client && npm test && npm run build`, poi `cd server && npm test` con il database `wallt_test`. Controllare `git diff --check`, elenco file e `git diff --stat`. Non eseguire migrazioni sul database personale o produzione.

- [ ] **Passo 5: verificare disponibilità degli strumenti iOS**

  Eseguire `xcodebuild -version` e `xcode-select -p`. Se Xcode completo non è installato, non dichiarare compilazione iOS riuscita: riportare che Capacitor richiede Xcode 26+, completare build e test audio/login su iPhone quando l’host è pronto.

- [ ] **Passo 6: controllare gate esterni per App Store**

  Non inviare l’app né cambiare configurazioni remote. Documentare come prerequisiti: approvazione dell’idoneità WALLT ai sensi Apple 3.2.1(viii), account Apple Developer/Google Cloud, Bundle ID definitivo, client e key provisioning, migrazione produzione, firma Xcode, icona 1024×1024 fornita separatamente e review guideline 4.2. Questi elementi non si possono completare dal repository e il lavoro sulle icone è escluso.

- [ ] **Passo 7: registrare verifica e commit finale**

  Creare il commit italiano `Documenta build iOS e prerequisiti App Store`, controllare che il ramo derivi da `origin/main` senza il commit icone e pubblicare solo il ramo `codex/wallt-ios-splash-auth` se il push è consentito dall’ambiente.

## Controllo di copertura della specifica

- Audio automatico, Silent switch, mix e fallback web/PWA: attività 2 e verifiche su dispositivo dell’attività 5.
- Google iOS e mantenimento Google web: attività 3 e 4.
- Sign in with Apple nativo/web, relay email, audience distinte e account collision: attività 3 e 4.
- Nonce, scadenza, replay, provider binding e istanze Vercel: attività 3 e test concorrenti PostgreSQL.
- CORS, secrets, App Store gates e icone escluse: attività 5.
- Compilazione nativa e test iPhone: documentati come non verificabili finché Xcode completo e credenziali non sono disponibili.

## Verifica del piano

- Ogni requisito della specifica ha un’attività assegnata.
- I test coprono replay concorrente, provider incrociati, email Apple relay, fallback web e plugin assente.
- I valori segreti sono distinti dalle variabili `VITE_*` pubbliche.
- L’icona App Store e l’idoneità legale sono gate esterni espliciti, non modifiche implicite al commit locale delle icone.
