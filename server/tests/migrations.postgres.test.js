const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');

const migrationsDir = path.resolve(__dirname, '../migrations');

describe('migrazioni compatibili con PostgreSQL e Supabase', () => {
  it('non contiene ENUM Sequelize o confronti booleani MySQL', () => {
    const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.js'));
    const source = migrationFiles
      .map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/Sequelize\.ENUM/);
    expect(source).not.toMatch(/\battiva\s*=\s*1\b/);
  });

  it('la migrazione social duplicata non ricrea colonne già presenti', async () => {
    const migration = require('../migrations/20250714_add_auth_provider');
    const queryInterface = {
      describeTable: jest.fn().mockResolvedValue({
        auth_provider: { allowNull: true },
        google_id: { allowNull: true },
        password: { allowNull: true },
      }),
      addColumn: jest.fn(),
      changeColumn: jest.fn(),
      sequelize: { query: jest.fn().mockResolvedValue([]) },
    };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).not.toHaveBeenCalled();
    expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    expect(queryInterface.sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("SET auth_provider = 'google', password = NULL"),
    );
  });

  it('abilita RLS e revoca i ruoli pubblici Supabase senza presumerne l’esistenza', async () => {
    const migration = require('../migrations/20260830000010-harden-supabase-access');
    const query = jest.fn().mockResolvedValue([]);

    await migration.up({ sequelize: { query } });

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("rolname = role_name");
    expect(sql).toContain("ARRAY['anon', 'authenticated']");
    expect(sql).toContain("'users'");
    expect(sql).toContain("'movimenti'");
    expect(sql).toContain("'password_reset_tokens'");
  });

  it('riapplica l’hardening a debiti con una migrazione additiva e transazionale', async () => {
    const migrationPath = path.join(
      migrationsDir,
      '20260917000025-harden-debiti-access.js',
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migration = require(migrationPath);
    const query = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn(async (callback) => callback('transaction-test'));
    const queryInterface = { sequelize: { query, transaction } };

    await migration.up(queryInterface);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'public', 'debiti'"),
      { transaction: 'transaction-test' },
    );
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("ARRAY['anon', 'authenticated']");
    expect(sql).toContain('REVOKE ALL PRIVILEGES');

    await migration.down(queryInterface);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('impone una sola esecuzione per ricorrenza e mese', async () => {
    const migration = require('../migrations/20260830000011-add-recurring-idempotency');
    const queryInterface = {
      addColumn: jest.fn().mockResolvedValue(undefined),
      addIndex: jest.fn().mockResolvedValue(undefined),
    };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'movimenti',
      'ricorrenza_origine_id',
      expect.objectContaining({ allowNull: true }),
    );
    expect(queryInterface.addColumn).toHaveBeenCalledWith(
      'movimenti',
      'ricorrenza_periodo',
      expect.objectContaining({ allowNull: true }),
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'movimenti',
      ['ricorrenza_origine_id', 'ricorrenza_periodo'],
      expect.objectContaining({ unique: true }),
    );
  });

  it('crea un contatore auth con chiave hash e vincolo di finestra', async () => {
    const migration = require('../migrations/20260830000012-create-auth-rate-limits');
    const queryInterface = {
      createTable: jest.fn().mockResolvedValue(undefined),
      addIndex: jest.fn().mockResolvedValue(undefined),
      sequelize: { query: jest.fn().mockResolvedValue([]) },
    };

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'auth_rate_limits',
      expect.objectContaining({
        key_hash: expect.objectContaining({ allowNull: false }),
        route: expect.objectContaining({ allowNull: false }),
        window_start: expect.objectContaining({ allowNull: false }),
        hit_count: expect.objectContaining({ allowNull: false }),
      }),
    );
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'auth_rate_limits',
      ['key_hash', 'route', 'window_start'],
      expect.objectContaining({ unique: true }),
    );
  });

  it('crea e rimuove la tabella dei contributi ai pagamenti programmati', async () => {
    const migrationPath = path.join(
      migrationsDir,
      '20261001000043-create-contributi-pagamenti-programmati.js',
    );
    const migrationEsiste = fs.existsSync(migrationPath);
    expect(migrationEsiste).toBe(true);
    if (!migrationEsiste) return;

    const migration = require(migrationPath);
    const transaction = { id: 'transaction-test' };
    const queryInterface = {
      createTable: jest.fn().mockResolvedValue(undefined),
      addIndex: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
      sequelize: {
        transaction: jest.fn(async (callback) => callback(transaction)),
        query: jest.fn().mockResolvedValue([]),
      },
    };

    await migration.up(queryInterface, Sequelize);

    const [, columns, createOptions] = queryInterface.createTable.mock.calls[0];
    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'contributi_pagamenti_programmati',
      expect.objectContaining({
        id: expect.objectContaining({ primaryKey: true }),
        user_id: expect.objectContaining({ allowNull: false }),
        pagamento_programmato_id: expect.objectContaining({ allowNull: false }),
        importo: expect.objectContaining({ allowNull: false }),
        data_contributo: expect.objectContaining({ allowNull: false }),
      }),
      { transaction },
    );
    expect(columns.pagamento_programmato_id.references).toEqual({
      model: 'pagamenti_programmati', key: 'id',
    });
    expect(createOptions.transaction).toBe(transaction);
    expect(queryInterface.addIndex).toHaveBeenCalledWith(
      'contributi_pagamenti_programmati',
      ['user_id', 'pagamento_programmato_id'],
      expect.objectContaining({ transaction }),
    );

    await migration.down(queryInterface);
    expect(queryInterface.dropTable).toHaveBeenCalledWith(
      'contributi_pagamenti_programmati',
      { transaction },
    );
  });

  const integrationTest = process.env.TEST_DATABASE_URL ? it : it.skip;
  integrationTest('crea lo schema completo su PostgreSQL', async () => {
    const { sequelize } = require('../models');
    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();
    const userColumns = await queryInterface.describeTable('users');
    const [debitiSecurity] = await sequelize.query(`
      SELECT c.relrowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'debiti'
    `);

    expect(tables).toEqual(expect.arrayContaining([
      'users',
      'profili_utente',
      'conti',
      'movimenti',
      'contributi_pagamenti_programmati',
      'password_reset_tokens',
    ]));
    expect(userColumns.password.allowNull).toBe(true);
    expect(userColumns.auth_provider).toBeDefined();
    expect(userColumns.google_id).toBeDefined();
    expect(debitiSecurity).toEqual([
      expect.objectContaining({ relrowsecurity: true }),
    ]);
  });
});
