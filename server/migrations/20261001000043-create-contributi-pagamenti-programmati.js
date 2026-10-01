'use strict';

const TABLE = 'contributi_pagamenti_programmati';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(TABLE, {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        pagamento_programmato_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'pagamenti_programmati', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        importo: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        data_contributo: { type: Sequelize.DATEONLY, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }, { transaction });

      await queryInterface.addIndex(TABLE, ['user_id', 'pagamento_programmato_id'], {
        name: 'idx_contributi_pagamenti_user_pagamento',
        transaction,
      });
      await queryInterface.addIndex(TABLE, ['pagamento_programmato_id', 'data_contributo'], {
        name: 'idx_contributi_pagamenti_data',
        transaction,
      });
      await queryInterface.sequelize.query(`
        DO $$
        DECLARE role_name text;
        BEGIN
          ALTER TABLE public.${TABLE} ENABLE ROW LEVEL SECURITY;
          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I', 'public', '${TABLE}', role_name);
            END IF;
          END LOOP;
        END
        $$;
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable(TABLE, { transaction });
    });
  },
};
