'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('auth_rate_limits', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      key_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      route: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      window_start: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      hit_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex(
      'auth_rate_limits',
      ['key_hash', 'route', 'window_start'],
      {
        name: 'uniq_auth_rate_limits_key_route_window',
        unique: true,
      },
    );
    await queryInterface.addIndex('auth_rate_limits', ['window_start'], {
      name: 'idx_auth_rate_limits_window_start',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
      DO $$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
              'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
              'public', 'auth_rate_limits', role_name
            );
          END IF;
        END LOOP;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('auth_rate_limits');
  },
};
