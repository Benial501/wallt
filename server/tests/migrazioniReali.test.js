/**
 * Le migrazioni eseguite per davvero su PostgreSQL, non `sequelize.sync()`.
 *
 * `sync()` costruisce lo schema dai modelli: verifica che i modelli siano
 * coerenti con sé stessi, non che la catena di migrazioni distribuita agli
 * ambienti reali produca quello schema — né che un database già popolato
 * sopravviva all'aggiornamento. Sono due cose diverse, e la seconda è quella
 * che rompe la produzione.
 *
 * Tutto avviene su un database USA E GETTA, creato e distrutto qui: non
 * `wallt_db` (sviluppo), non `wallt_test` (le altre suite), mai Supabase. I
 * controlli in `assertDatabaseUsaEGetta` sono la barriera: se il nome o l'host
 * non sono quelli attesi, la suite si rifiuta di partire invece di lavorare
 * sul database sbagliato.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const CLI = path.resolve(__dirname, '../node_modules/sequelize-cli/lib/sequelize');
const RADICE = path.resolve(__dirname, '..');

const NOME_DB = process.env.DB_NAME_MIGRAZIONI_TEST || 'wallt_migrazioni_usaegetta';
// Ultima migrazione PRIMA del gruppo aggiunto per le fondamenta pre-Smart
// (essenzialità, tipo_obiettivo, debiti, ricorrenze settimanali/annuali,
// classificazione entrate, liquidabilità, stato ricorrenza, priorità).
const ULTIMA_PRE_SMART = '20260914000021-riallinea-conti-di-gioco.js';
const MIGRAZIONI_PRE_SMART = [
  '20260917000022-add-essenzialita-categorie-personali.js',
  '20260917000023-add-tipo-obiettivo.js',
  '20260917000024-create-debiti.js',
  '20260917000025-harden-debiti-access.js',
  '20260923000026-add-ricorrenza-settimanale-annuale.js',
  '20260923000027-add-classificazione-entrate.js',
  '20260923000027-create-categorie-default-essenzialita.js',
  '20260923000028-add-liquidabilita-investimenti.js',
  '20260923000029-add-stato-ricorrenza.js',
  '20260923000030-add-priorita-obiettivi.js',
];

const urlUsaEGetta = () => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = `/${NOME_DB}`;
  return url;
};

/**
 * Prima di qualunque DROP/CREATE: il database deve essere locale, con un nome
 * dedicato, e diverso sia da quello di sviluppo sia da quello delle altre
 * suite. Un errore qui deve fermare tutto, non degradare.
 */
const assertDatabaseUsaEGetta = () => {
  const url = urlUsaEGetta();
  const host = url.hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Sicurezza migrazioni: host non locale "${host}". Rifiuto di procedere.`);
  }
  if (!/^[a-z0-9_]+$/.test(NOME_DB) || !/usaegetta|usa_e_getta/.test(NOME_DB)) {
    throw new Error(`Sicurezza migrazioni: nome database non riconoscibile come usa e getta: "${NOME_DB}".`);
  }
  for (const vietato of [process.env.DB_NAME_TEST, 'wallt_db', 'postgres']) {
    if (NOME_DB === vietato) {
      throw new Error(`Sicurezza migrazioni: "${NOME_DB}" non è un database usa e getta.`);
    }
  }
  // DB_NAME in ambiente test è già forzato a DB_NAME_TEST da tests/env.js: il
  // riferimento allo sviluppo è il default documentato del config.
  if (NOME_DB === 'wallt_db') throw new Error('Sicurezza migrazioni: è il database di sviluppo.');
  return url;
};

const adminClient = () => {
  const url = urlUsaEGetta();
  url.pathname = '/postgres';
  return new Client({ connectionString: url.toString() });
};

const ricreaDatabase = async () => {
  assertDatabaseUsaEGetta();
  const admin = adminClient();
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${NOME_DB}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${NOME_DB}"`);
  } finally {
    await admin.end();
  }
};

const eliminaDatabase = async () => {
  assertDatabaseUsaEGetta();
  const admin = adminClient();
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${NOME_DB}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
};

/** sequelize-cli sul solo database usa e getta: l'env del processo non viene
 * mai modificato, così le altre suite continuano a puntare a wallt_test. */
const cli = (args) => execFileSync(process.execPath, [CLI, ...args], {
  cwd: RADICE,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    TEST_DATABASE_URL: urlUsaEGetta().toString(),
    DB_NAME: NOME_DB,
    DB_NAME_TEST: NOME_DB,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const client = async () => {
  const c = new Client({ connectionString: urlUsaEGetta().toString() });
  await c.connect();
  return c;
};

const colonna = async (c, tabella, nome) => {
  const { rows } = await c.query(
    `SELECT is_nullable, column_default, data_type, character_maximum_length
     FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tabella, nome],
  );
  return rows[0] || null;
};

const vincoliCheck = async (c, tabella) => {
  const { rows } = await c.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS definizione
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = $1 AND con.contype = 'c'`,
    [tabella],
  );
  return rows;
};

describe('migrazioni reali — schema creato da zero dalla catena completa', () => {
  let c;

  beforeAll(async () => {
    await ricreaDatabase();
    cli(['db:migrate']);
    c = await client();
  }, 180000);

  afterAll(async () => {
    if (c) await c.end();
  });

  it('crea le tabelle del gruppo pre-Smart', async () => {
    const { rows } = await c.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tabelle = rows.map((r) => r.table_name);
    expect(tabelle).toEqual(expect.arrayContaining([
      'users', 'conti', 'movimenti', 'obiettivi', 'investimenti',
      'debiti', 'categorie_personali', 'categorie_default_nascoste',
      'categorie_default_essenzialita',
    ]));
  });

  it('movimenti.stato_ricorrenza è NOT NULL con default attiva', async () => {
    const col = await colonna(c, 'movimenti', 'stato_ricorrenza');
    expect(col).not.toBeNull();
    expect(col.is_nullable).toBe('NO');
    expect(col.column_default).toContain("'attiva'");
  });

  it('obiettivi ha tipo_obiettivo con default e vincolo, e priorita nullable vincolata', async () => {
    const tipo = await colonna(c, 'obiettivi', 'tipo_obiettivo');
    expect(tipo.is_nullable).toBe('NO');
    expect(tipo.column_default).toContain("'generico'");

    const priorita = await colonna(c, 'obiettivi', 'priorita');
    expect(priorita.is_nullable).toBe('YES');
    expect(priorita.column_default).toBeNull();

    const definizioni = (await vincoliCheck(c, 'obiettivi')).map((r) => r.definizione).join(' ');
    expect(definizioni).toContain('fondo_sicurezza');
    expect(definizioni).toContain('alta');
  });

  it('investimenti.liquidabilita è NOT NULL con default sconosciuto', async () => {
    const col = await colonna(c, 'investimenti', 'liquidabilita');
    expect(col.is_nullable).toBe('NO');
    expect(col.column_default).toContain("'sconosciuto'");
  });

  it('movimenti.ricorrenza_periodo è lungo abbastanza per la chiave settimanale', async () => {
    const col = await colonna(c, 'movimenti', 'ricorrenza_periodo');
    expect(col.character_maximum_length).toBeGreaterThanOrEqual(8);
  });

  it('movimenti ha la classificazione entrate con i default legacy', async () => {
    const natura = await colonna(c, 'movimenti', 'natura_entrata');
    const periodicita = await colonna(c, 'movimenti', 'periodicita_entrata');
    expect(natura.column_default).toContain("'sconosciuto'");
    expect(periodicita.column_default).toContain("'sconosciuta'");
  });

  it('debiti ha i vincoli su tipo e frequenza e la RLS attiva', async () => {
    const definizioni = (await vincoliCheck(c, 'debiti')).map((r) => r.definizione).join(' ');
    expect(definizioni).toContain('mutuo');
    expect(definizioni).toContain('settimanale');

    const { rows } = await c.query(
      `SELECT rel.relrowsecurity FROM pg_class rel
       JOIN pg_namespace n ON n.oid = rel.relnamespace
       WHERE n.nspname = 'public' AND rel.relname = 'debiti'`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
  });

  it('categorie_default_essenzialita vincola i tre livelli validi', async () => {
    const definizioni = (await vincoliCheck(c, 'categorie_default_essenzialita'))
      .map((r) => r.definizione).join(' ');
    expect(definizioni).toContain('semi_essenziale');
  });

  it('non resta nessuna migrazione pendente', () => {
    const stato = cli(['db:migrate:status']);
    const pendenti = stato.split('\n').filter((riga) => riga.startsWith('down '));
    expect(pendenti).toEqual([]);
    expect(stato).toContain('up 20260923000030-add-priorita-obiettivi.js');
  });
});

describe('migrazioni reali — aggiornamento da uno schema precedente con record legacy', () => {
  let c;

  beforeAll(async () => {
    await ricreaDatabase();
    // 1. Schema come era PRIMA del gruppo pre-Smart.
    cli(['db:migrate', '--to', ULTIMA_PRE_SMART]);

    // 2. Record legacy sintetici: nessuna delle colonne nuove esiste ancora,
    //    quindi sono davvero righe "vecchie", non righe scritte dal codice
    //    attuale con i campi azzerati.
    c = await client();
    await c.query(`
      INSERT INTO users (id, nome, email, created_at, updated_at)
      VALUES (1, 'Utente Legacy', 'legacy@example.invalid', now(), now());
      INSERT INTO conti (id, user_id, nome, tipo, saldo, attivo, created_at, updated_at)
      VALUES (1, 1, 'Conto Legacy', 'banca', 1500.00, true, now(), now());
      INSERT INTO movimenti (id, user_id, conto_id, tipo, importo, categoria, descrizione, data,
                             ricorrente, ricorrente_frequenza, ricorrente_giorno, created_at, updated_at)
      VALUES (1, 1, 1, 'uscita', 300.00, 'affitto', 'Affitto legacy', '2026-01-05',
              true, 'mensile', 5, now(), now());
      INSERT INTO movimenti (id, user_id, conto_id, tipo, importo, categoria, descrizione, data,
                             ricorrente, created_at, updated_at)
      VALUES (2, 1, 1, 'entrata', 1200.00, 'stipendio', 'Stipendio legacy', '2026-01-27',
              false, now(), now());
      INSERT INTO obiettivi (id, user_id, nome, importo_target, importo_attuale, completato, created_at, updated_at)
      VALUES (1, 1, 'Obiettivo Legacy', 5000.00, 750.00, false, now(), now());
      INSERT INTO investimenti (id, user_id, nome_piattaforma, tipo, saldo_attuale, attivo, created_at, updated_at)
      VALUES (1, 1, 'Broker Legacy', 'azioni', 2000.00, true, now(), now());
      INSERT INTO categorie_personali (id, user_id, nome, nome_normalizzato, tipo, icona, colore, attiva, created_at, updated_at)
      VALUES ('custom_legacy_uscita', 1, 'Barca', 'barca', 'uscita', 'Tag', '#3498DB', true, now(), now());
      INSERT INTO categorie_personali (id, user_id, nome, nome_normalizzato, tipo, icona, colore, attiva, created_at, updated_at)
      VALUES ('custom_legacy_entrata', 1, 'Mance', 'mance', 'entrata', 'Tag', '#3498DB', true, now(), now());
    `);

    // 3. Le migrazioni nuove, sopra dati già esistenti.
    cli(['db:migrate']);
  }, 180000);

  afterAll(async () => {
    if (c) await c.end();
    await eliminaDatabase();
  });

  it('applica tutte e sole le migrazioni pre-Smart mancanti', () => {
    const stato = cli(['db:migrate:status']);
    MIGRAZIONI_PRE_SMART.forEach((nome) => {
      expect(stato).toContain(`up ${nome}`);
    });
    expect(stato.split('\n').filter((riga) => riga.startsWith('down '))).toEqual([]);
  });

  it('conserva i record legacy: nessuna riga persa né alterata nei valori originali', async () => {
    const { rows: movimenti } = await c.query('SELECT id, importo, categoria, descrizione, data FROM movimenti ORDER BY id');
    expect(movimenti).toHaveLength(2);
    expect(movimenti[0].descrizione).toBe('Affitto legacy');
    expect(Number(movimenti[0].importo)).toBe(300);
    expect(movimenti[1].descrizione).toBe('Stipendio legacy');

    const { rows: conti } = await c.query('SELECT nome, saldo FROM conti');
    expect(conti).toHaveLength(1);
    expect(Number(conti[0].saldo)).toBe(1500);

    const { rows: obiettivi } = await c.query('SELECT nome, importo_attuale FROM obiettivi');
    expect(obiettivi[0].nome).toBe('Obiettivo Legacy');
    expect(Number(obiettivi[0].importo_attuale)).toBe(750);

    const { rows: investimenti } = await c.query('SELECT nome_piattaforma FROM investimenti');
    expect(investimenti[0].nome_piattaforma).toBe('Broker Legacy');
  });

  it('una ricorrenza legacy diventa attiva, non uno stato vuoto', async () => {
    const { rows } = await c.query('SELECT stato_ricorrenza FROM movimenti WHERE ricorrente = true');
    expect(rows).toHaveLength(1);
    expect(rows[0].stato_ricorrenza).toBe('attiva');
  });

  it('un obiettivo legacy è generico e senza priorità: nessun valore inventato', async () => {
    const { rows } = await c.query('SELECT tipo_obiettivo, priorita FROM obiettivi');
    expect(rows[0].tipo_obiettivo).toBe('generico');
    expect(rows[0].priorita).toBeNull();
  });

  it('un investimento legacy ha liquidabilità sconosciuta, non "liquidabile" per comodità', async () => {
    const { rows } = await c.query('SELECT liquidabilita, giorni_disponibilita FROM investimenti');
    expect(rows[0].liquidabilita).toBe('sconosciuto');
    expect(rows[0].giorni_disponibilita).toBeNull();
  });

  it('un movimento legacy non viene classificato per inferenza', async () => {
    const { rows } = await c.query('SELECT natura_entrata, periodicita_entrata FROM movimenti ORDER BY id');
    rows.forEach((riga) => {
      expect(riga.natura_entrata).toBe('sconosciuto');
      expect(riga.periodicita_entrata).toBe('sconosciuta');
    });
  });

  it('una categoria personale legacy di uscita eredita discrezionale, quella di entrata resta NULL', async () => {
    const { rows } = await c.query('SELECT id, essenzialita FROM categorie_personali ORDER BY id');
    const uscita = rows.find((r) => r.id === 'custom_legacy_uscita');
    const entrata = rows.find((r) => r.id === 'custom_legacy_entrata');
    expect(uscita.essenzialita).toBe('discrezionale');
    expect(entrata.essenzialita).toBeNull();
  });

  it('rieseguire la catena sopra uno schema già aggiornato non cambia nulla', () => {
    // dotenv stampa un "tip" scelto a caso a ogni avvio: si confrontano le
    // sole righe di stato delle migrazioni.
    const soloStato = (testo) => testo.split('\n')
      .filter((riga) => /^(up|down) /.test(riga.trim()))
      .map((riga) => riga.trim());

    const prima = soloStato(cli(['db:migrate:status']));
    expect(prima.length).toBeGreaterThan(0);
    cli(['db:migrate']);
    expect(soloStato(cli(['db:migrate:status']))).toEqual(prima);
  });
});
