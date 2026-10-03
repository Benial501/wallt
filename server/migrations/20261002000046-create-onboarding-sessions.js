'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('onboarding_sessions', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        schema_version: { type: S.INTEGER, allowNull: false, defaultValue: 2 },
        current_step: { type: S.STRING(32), allowNull: false, defaultValue: 'utilizzi' },
        status: { type: S.STRING(16), allowNull: false, defaultValue: 'draft' },
        answers: { type: S.JSONB, allowNull: false, defaultValue: {} },
        revision: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
        last_saved_at: { type: S.DATE, allowNull: true },
        completed_at: { type: S.DATE, allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.sequelize.query("ALTER TABLE onboarding_sessions ADD CONSTRAINT onboarding_sessions_status CHECK (status IN ('draft','ready','completed','failed'))", { transaction });
      await q.sequelize.query('ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY', { transaction });
      await q.sequelize.query(`DO $$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.onboarding_sessions FROM %I', role_name); END IF; END LOOP; END $$;`, { transaction });
    });
  },
  async down(q) { await q.dropTable('onboarding_sessions'); },
};
