'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('onboarding_imports', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        session_id: { type: S.INTEGER, allowNull: false, references: { model: 'onboarding_sessions', key: 'id' }, onDelete: 'CASCADE' },
        account_key: { type: S.STRING(60), allowNull: false },
        status: { type: S.STRING(16), allowNull: false, defaultValue: 'draft' },
        preview: { type: S.JSONB, allowNull: false },
        rows: { type: S.JSONB, allowNull: false, defaultValue: [] },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.addIndex('onboarding_imports', ['session_id'], { transaction });
      await q.sequelize.query("ALTER TABLE onboarding_imports ADD CONSTRAINT onboarding_imports_status CHECK (status IN ('draft','confirmed'))", { transaction });
      await q.sequelize.query('ALTER TABLE public.onboarding_imports ENABLE ROW LEVEL SECURITY', { transaction });
      await q.sequelize.query(`DO $$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.onboarding_imports FROM %I', role_name); END IF; END LOOP; END $$;`, { transaction });
    });
  },
  async down(q) { await q.dropTable('onboarding_imports'); },
};
