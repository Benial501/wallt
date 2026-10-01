/**
 * Il contratto di WALLT Premium fra client e server, verificato confrontando
 * i due vocabolari invece di fidarsi che restino allineati (stesso principio
 * di `pianoSmartContratto.test.js` e `fondoEmergenzaContratto.test.js`).
 *
 * `src/utils/entitlements.js` duplica di proposito piani, origini, stati
 * delle connessioni e codici d'errore: se una delle due parti cambia da
 * sola, qui si rompe. Senza questo test una divergenza si manifesterebbe come
 * un pulsante che non compare o un messaggio d'errore sbagliato — un difetto
 * silenzioso, scoperto da un utente.
 *
 * Il lato server si legge dai moduli in `server/constants/`, NON dai service:
 * i service fanno `require('../models')` e quindi caricano Sequelize, che nel
 * job "Frontend (build)" della CI non è installato (lì `npm ci` gira solo in
 * `client/`). È l'errore che ha reso `fondoEmergenzaContratto.test.js`
 * incapace di caricarsi per sei commit, sorvegliando un contratto mai
 * verificato. Gli ultimi due test qui sotto impediscono che si ripeta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import serverEntitlements from '../../server/constants/entitlements.js';
import serverBankSync from '../../server/constants/bankSync.js';
import serverAppConfig from '../../server/constants/appConfig.js';
import * as client from '../src/utils/entitlements.js';

/**
 * Il sorgente senza commenti.
 *
 * Questi file documentano per esteso le proprie scelte, e per farlo CITANO
 * sia il numero dei posti sia `require(...)`. Un commento che cita una cosa
 * non è quella cosa: senza questo passaggio i controlli qui sotto
 * fallirebbero sulla propria documentazione, ed è esattamente il difetto che
 * `contrasto.test.js` descrive per il CSS.
 */
const senzaCommenti = (percorso) => readFileSync(new URL(percorso, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// ── Feature ────────────────────────────────────────────────────────────────

test('la chiave della feature Bank Sync è la stessa nei due lati', () => {
  assert.equal(client.FEATURE_BANK_SYNC, serverEntitlements.FEATURE_BANK_SYNC);
});

test('l\'elenco delle feature coincide', () => {
  assert.deepEqual([...client.FEATURE_KEYS], [...serverEntitlements.FEATURE_KEYS]);
});

// ── Piani ──────────────────────────────────────────────────────────────────

test('i piani e le loro etichette coincidono', () => {
  assert.deepEqual([...client.PIANI], [...serverEntitlements.PIANI]);
  assert.deepEqual(
    { ...client.PIANO_ETICHETTE },
    { ...serverEntitlements.PIANO_ETICHETTE },
  );
});

test('ogni piano ha un\'etichetta: nessun piano resta senza nome a schermo', () => {
  client.PIANI.forEach((piano) => {
    assert.ok(client.PIANO_ETICHETTE[piano], `etichetta mancante per ${piano}`);
  });
});

// ── Origini del permesso ───────────────────────────────────────────────────

test('le origini di un entitlement coincidono', () => {
  assert.deepEqual(
    [...client.ENTITLEMENT_SOURCES],
    [...serverEntitlements.ENTITLEMENT_SOURCES],
  );
});

test('ogni origine ha una spiegazione per l\'utente', () => {
  // Senza questa, un utente a cui lo staff ha concesso l'accesso leggerebbe
  // un codice tecnico (`admin`) al posto di una frase.
  serverEntitlements.ENTITLEMENT_SOURCES.forEach((source) => {
    assert.ok(client.SOURCE_ETICHETTE[source], `spiegazione mancante per ${source}`);
  });
});

test('la spiegazione del posto beta non viene usata per le altre origini', () => {
  // Dire "fra i primi 25" a chi ha ricevuto l'accesso dallo staff o lo paga
  // sarebbe falso, e renderebbe incomprensibile il conteggio dei posti.
  const beta = client.SOURCE_ETICHETTE[client.SOURCE_BETA_25];
  const altre = serverEntitlements.ENTITLEMENT_SOURCES
    .filter((s) => s !== client.SOURCE_BETA_25)
    .map((s) => client.SOURCE_ETICHETTE[s]);
  altre.forEach((etichetta) => assert.notEqual(etichetta, beta));
});

// ── Richieste di accesso a Premium ─────────────────────────────────────────

test('gli stati di una richiesta Premium coincidono', () => {
  assert.deepEqual(
    [...client.RICHIESTA_STATI],
    [...serverEntitlements.RICHIESTA_STATI],
  );
});

test('ogni stato di una richiesta ha un\'etichetta amministrativa', () => {
  // Il pannello admin filtra e conta per stato: uno stato senza nome
  // comparirebbe come codice tecnico in una colonna che l'amministratore
  // deve poter leggere a colpo d'occhio.
  serverEntitlements.RICHIESTA_STATI.forEach((stato) => {
    assert.ok(client.RICHIESTA_ETICHETTE[stato], `etichetta mancante per ${stato}`);
  });
});

test('ogni stato ha anche una frase per l\'utente, diversa dall\'etichetta', () => {
  // L'utente non deve leggere "Approvata" ma cosa può fare adesso: sono due
  // domande diverse, e usare la stessa stringa per entrambe produrrebbe
  // schermate che non rispondono a nessuna delle due.
  serverEntitlements.RICHIESTA_STATI.forEach((stato) => {
    const messaggio = client.RICHIESTA_MESSAGGI_UTENTE[stato];
    assert.ok(messaggio, `messaggio mancante per ${stato}`);
    assert.ok(messaggio.titolo?.trim(), `titolo vuoto per ${stato}`);
    assert.ok(messaggio.testo?.trim(), `testo vuoto per ${stato}`);
  });
});

test('la beta automatica resta distinta dall\'approvazione manuale', () => {
  // Sono due cose diverse: una l'ha decisa la quota, l'altra una persona.
  // Fonderle renderebbe impossibile sapere quanti posti beta sono occupati.
  assert.notEqual(
    serverEntitlements.RICHIESTA_AUTO_APPROVED_BETA,
    serverEntitlements.RICHIESTA_APPROVED,
  );
  assert.notEqual(
    client.RICHIESTA_ETICHETTE[client.RICHIESTA_AUTO_APPROVED_BETA],
    client.RICHIESTA_ETICHETTE[client.RICHIESTA_APPROVED],
  );
});

test('si può richiedere solo se non esiste nulla o se l\'avevi annullata tu', () => {
  // Riaprire una richiesta rifiutata cancellerebbe una decisione dello
  // staff, che il brief chiede di conservare.
  assert.equal(client.puoRichiedere(null), true);
  assert.equal(client.puoRichiedere({ status: client.RICHIESTA_CANCELLED }), true);
  assert.equal(client.puoRichiedere({ status: client.RICHIESTA_PENDING }), false);
  assert.equal(client.puoRichiedere({ status: client.RICHIESTA_REJECTED }), false);
  assert.equal(client.puoRichiedere({ status: client.RICHIESTA_APPROVED }), false);
});

test('le feature richiedibili sono un sottoinsieme di quelle conosciute', () => {
  serverEntitlements.FEATURE_RICHIEDIBILI.forEach((feature) => {
    assert.ok(
      serverEntitlements.FEATURE_KEYS.includes(feature),
      `${feature} è richiedibile ma non è una feature conosciuta`,
    );
  });
});

// ── Stati della connessione ────────────────────────────────────────────────

test('gli stati di una connessione bancaria coincidono', () => {
  assert.deepEqual(
    [...client.CONNECTION_STATUS],
    [...serverBankSync.CONNECTION_STATUS],
  );
});

test('lo stato attivo e quello sospeso hanno lo stesso nome nei due lati', () => {
  assert.equal(client.STATO_ATTIVA, serverBankSync.STATO_ATTIVA);
  assert.equal(client.STATO_SOSPESA_ENTITLEMENT, serverBankSync.STATO_SOSPESA_ENTITLEMENT);
});

// ── Codici d'errore ────────────────────────────────────────────────────────

test('i codici d\'errore della sincronizzazione coincidono', () => {
  assert.deepEqual(
    [...client.SYNC_ERROR_CODES],
    [...serverBankSync.SYNC_ERROR_CODES],
  );
});

test('ogni codice d\'errore ha un messaggio e un\'azione per l\'utente', () => {
  // È la regola centrale della UX degli errori: "Errore generico" non è una
  // risposta, perché "ricollega" e "riprova" sono due azioni diverse.
  serverBankSync.SYNC_ERROR_CODES.forEach((codice) => {
    const messaggio = client.ERRORE_MESSAGGI[codice];
    assert.ok(messaggio, `messaggio mancante per ${codice}`);
    assert.ok(messaggio.titolo?.trim(), `titolo vuoto per ${codice}`);
    assert.ok(messaggio.testo?.trim(), `testo vuoto per ${codice}`);
    assert.ok(
      ['ricollega', 'riprova', 'attendi', 'nessuna'].includes(messaggio.azione),
      `azione non riconosciuta per ${codice}: ${messaggio.azione}`,
    );
  });
});

test('gli errori che richiedono la riconnessione sono gli stessi, e propongono "ricollega"', () => {
  assert.deepEqual(
    [...client.ERRORI_RICHIEDONO_RICONNESSIONE],
    [...serverBankSync.ERRORI_RICHIEDONO_RICONNESSIONE],
  );
  client.ERRORI_RICHIEDONO_RICONNESSIONE.forEach((codice) => {
    assert.equal(client.ERRORE_MESSAGGI[codice].azione, 'ricollega');
    assert.equal(client.richiedeRiconnessione(codice), true);
  });
});

test('un errore sconosciuto non lascia l\'utente senza messaggio, e non mente sui dati', () => {
  const messaggio = client.messaggioErrore('CODICE_MAI_VISTO');
  assert.ok(messaggio.titolo);
  // Il ripiego deve dire che i dati precedenti ci sono ancora: è la cosa che
  // l'utente ha bisogno di sapere, e che non dipende dal codice.
  assert.match(messaggio.testo, /dati precedenti/i);
});

test('nessun messaggio d\'errore mostra dettagli tecnici all\'utente', () => {
  Object.values(client.ERRORE_MESSAGGI).forEach(({ titolo, testo }) => {
    const insieme = `${titolo} ${testo}`;
    assert.doesNotMatch(insieme, /HTTP \d|stack|token|secret|null|undefined/i);
  });
});

// ── Limiti ─────────────────────────────────────────────────────────────────

test('il limite di un conto sincronizzato per utente è lo stesso nei due lati', () => {
  assert.equal(
    client.MAX_CONNESSIONI_PER_UTENTE,
    serverBankSync.MAX_CONNESSIONI_PER_UTENTE,
  );
  assert.equal(client.MAX_CONNESSIONI_PER_UTENTE, 1);
});

// ── Il limite dei posti beta NON è duplicato nel client ────────────────────

test('il client non contiene il numero dei posti beta', () => {
  // Il limite vive solo in `app_config` (default in
  // `server/constants/appConfig.js`) ed è modificabile a runtime. Duplicarlo
  // qui lo renderebbe una seconda verità: il frontend mostrerebbe "25 posti"
  // dopo che l'amministratore li ha portati a 50, e il brief vieta
  // esplicitamente di cablare quel numero.
  assert.doesNotMatch(
    senzaCommenti('../src/utils/entitlements.js'),
    /\b25\b/,
    'il numero dei posti beta è cablato nel client',
  );
  assert.equal(serverAppConfig.valoreDefault('bank_sync_beta_limit'), 25);
});

test('i due interruttori di Bank Sync restano distinti nella configurazione', () => {
  // Spegnere le attivazioni gratuite non deve spegnere la sincronizzazione a
  // chi l'ha già, e viceversa.
  assert.ok(serverAppConfig.isChiaveConfig('bank_sync_enabled'));
  assert.ok(serverAppConfig.isChiaveConfig('bank_sync_beta_enabled'));
  assert.notEqual(
    serverAppConfig.BANK_SYNC_ENABLED,
    serverAppConfig.BANK_SYNC_BETA_ENABLED,
  );
});

// ── I moduli del server restano importabili senza Sequelize ───────────────

test('i vocabolari del server non importano nulla', () => {
  // Se uno di questi file acquisisse un `require`, questo test non riuscirebbe
  // più a caricarsi nel job "Frontend (build)" della CI, dove
  // `server/node_modules` non esiste — e smetterebbe di sorvegliare il
  // contratto senza che nessuno se ne accorga.
  for (const nome of ['entitlements', 'bankSync', 'appConfig']) {
    assert.doesNotMatch(
      senzaCommenti(`../../server/constants/${nome}.js`),
      /\brequire\(/,
      `constants/${nome}.js ha acquisito un require`,
    );
  }
});

test('i service leggono il vocabolario dai moduli condivisi, non lo ridefiniscono', () => {
  // Il confronto qui sopra vale solo se il server ha una sorgente sola. Se le
  // costanti tornassero a vivere dentro i service, questo file continuerebbe
  // a confrontare il client con moduli che nessuno usa più.
  const entitlementsService = readFileSync(
    new URL('../../server/services/entitlements.service.js', import.meta.url),
    'utf8',
  );
  assert.match(
    entitlementsService,
    /require\('\.\.\/constants\/entitlements'\)/,
    'entitlements.service non importa il vocabolario condiviso',
  );
  assert.doesNotMatch(
    entitlementsService,
    /const\s+(FEATURE_BANK_SYNC|PIANI|ENTITLEMENT_SOURCES)\s*=/,
    'entitlements.service ridefinisce una costante del vocabolario',
  );

  const syncEngine = readFileSync(
    new URL('../../server/services/bankSync/syncEngine.service.js', import.meta.url),
    'utf8',
  );
  assert.match(
    syncEngine,
    /require\('\.\.\/\.\.\/constants\/bankSync'\)/,
    'syncEngine non importa il vocabolario condiviso',
  );
});

test('il limite dei posti beta non è cablato da nessuna parte nel codice del server', () => {
  // Il brief lo vieta esplicitamente: `if (count < 25)` sparso nel codice.
  // Il numero deve comparire SOLO come default nello schema di configurazione.
  for (const percorso of [
    '../../server/services/betaSlots.service.js',
    '../../server/services/entitlements.service.js',
    '../../server/controllers/bankSync.controller.js',
    '../../server/controllers/piano.controller.js',
  ]) {
    assert.doesNotMatch(
      senzaCommenti(percorso),
      /\b25\b/,
      `${percorso} contiene il limite cablato`,
    );
  }
});
