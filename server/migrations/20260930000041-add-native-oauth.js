'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const userColumns = await queryInterface.describeTable('users', { transaction });
      if (!userColumns.apple_id) {
        await queryInterface.addColumn('users', 'apple_id', {
          type: Sequelize.STRING(255),
          allowNull: true,
          unique: true,
        }, { transaction });
      }

      await queryInterface.createTable('oauth_challenges', {
        id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
        },
        challenge_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        nonce_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        provider: {
          type: Sequelize.STRING(16),
          allowNull: false,
        },
        purpose: {
          type: Sequelize.STRING(16),
          allowNull: false,
        },
        platform: {
          type: Sequelize.STRING(8),
          allowNull: false,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        consumed_at: {
          type: Sequelize.DATE,
          allowNull: true,
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
      }, { transaction });

      await queryInterface.addIndex('oauth_challenges', ['challenge_hash'], {
        name: 'uniq_oauth_challenges_challenge_hash',
        unique: true,
        transaction,
      });
      await queryInterface.addIndex('oauth_challenges', ['expires_at'], {
        name: 'idx_oauth_challenges_expires_at',
        transaction,
      });
      await queryInterface.addIndex('oauth_challenges', ['user_id', 'purpose', 'expires_at'], {
        name: 'idx_oauth_challenges_user_purpose_expires',
        transaction,
      });

      await queryInterface.sequelize.query(`
        ALTER TABLE public.oauth_challenges ENABLE ROW LEVEL SECURITY;
        DO $$
        DECLARE role_name text;
        BEGIN
          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', 'oauth_challenges', role_name
              );
            END IF;
          END LOOP;
        END
        $$;
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('oauth_challenges', { transaction });
      const userColumns = await queryInterface.describeTable('users', { transaction });
      if (userColumns.apple_id) {
        await queryInterface.removeColumn('users', 'apple_id', { transaction });
      }
    });
  },
};
